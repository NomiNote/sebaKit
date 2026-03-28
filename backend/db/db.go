// Package db handles SQLite connection, schema migration, and initial seeding.
package db

import (
	"database/sql"
	_ "embed"
	"fmt"
	"log"
	"math/rand"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schemaSQL string

// Open creates (or opens) the SQLite database at dataDir/meds.db,
// applies the schema, enables WAL mode & foreign keys, and seeds if empty.
func Open(dataDir string) (*sql.DB, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	dsn := filepath.Join(dataDir, "meds.db") + "?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	// Single-connection pool for SQLite.
	db.SetMaxOpenConns(1)

	if err := migrate(db); err != nil {
		db.Close()
		return nil, err
	}

	if err := seedIfEmpty(db); err != nil {
		db.Close()
		return nil, err
	}

	return db, nil
}

func migrate(db *sql.DB) error {
	if _, err := db.Exec(schemaSQL); err != nil {
		return fmt.Errorf("apply schema: %w", err)
	}

	// Migration: add start_date/end_date to schedules if missing.
	for _, col := range []struct{ name, ddl string }{
		{"start_date", `ALTER TABLE schedules ADD COLUMN start_date TEXT NOT NULL DEFAULT '2000-01-01'`},
		{"end_date", `ALTER TABLE schedules ADD COLUMN end_date TEXT`},
	} {
		var dummy string
		err := db.QueryRow(`SELECT ` + col.name + ` FROM schedules LIMIT 1`).Scan(&dummy)
		if err != nil {
			if _, err2 := db.Exec(col.ddl); err2 != nil {
				log.Printf("migration %s: %v (may already exist)", col.name, err2)
			}
		}
	}

	return nil
}

// seedIfEmpty populates the database with demo data when no medications exist.
func seedIfEmpty(db *sql.DB) error {
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM medications").Scan(&count); err != nil {
		return fmt.Errorf("check medications: %w", err)
	}
	if count > 0 {
		return nil // already seeded
	}

	log.Println("Seeding demo data …")

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// --- Caregiver ---
	if _, err := tx.Exec(`INSERT INTO caregivers (name, email) VALUES ('Sarah', 'sarah@demo.com')`); err != nil {
		return err
	}

	// --- Medications ---
	meds := []struct {
		name, dose, notes string
	}{
		{"Metformin", "500 mg", "Take with food"},
		{"Lisinopril", "10 mg", "Blood pressure"},
		{"Vitamin D3", "1000 IU", "Supplement"},
	}
	medIDs := make([]int64, len(meds))
	for i, m := range meds {
		res, err := tx.Exec(`INSERT INTO medications (name, dose, notes) VALUES (?, ?, ?)`, m.name, m.dose, m.notes)
		if err != nil {
			return err
		}
		medIDs[i], _ = res.LastInsertId()
	}

	// --- Schedules ---
	type sched struct {
		medIdx int
		tod    string
		days   string
	}
	schedules := []sched{
		{0, "08:00", "1,2,3,4,5,6,7"},
		{0, "14:00", "1,2,3,4,5,6,7"},
		{0, "20:00", "1,2,3,4,5,6,7"},
		{1, "08:00", "1,2,3,4,5,6,7"},
		{2, "20:00", "1,2,3,4,5,6,7"},
	}
	now := time.Now()
	startDate := now.AddDate(0, 0, -7).Format("2006-01-02") // started 7 days ago for demo
	schedIDs := make([]int64, len(schedules))
	for i, s := range schedules {
		res, err := tx.Exec(`INSERT INTO schedules (medication_id, time_of_day, days_of_week, start_date, active) VALUES (?, ?, ?, ?, 1)`,
			medIDs[s.medIdx], s.tod, s.days, startDate)
		if err != nil {
			return err
		}
		schedIDs[i], _ = res.LastInsertId()
	}

	// --- Past events (last 7 days) ---
	// Generate 6 realistic events: mix of completed & missed.
	rng := rand.New(rand.NewSource(42)) // deterministic for demo reproducibility
	type pastEvent struct {
		medIdx, schedIdx int
		daysAgo          int
		completed        bool
	}
	past := []pastEvent{
		{0, 0, 6, true},  // Metformin 08:00, 6 days ago — taken
		{0, 1, 5, true},  // Metformin 14:00, 5 days ago — taken
		{1, 3, 4, true},  // Lisinopril 08:00, 4 days ago — taken
		{0, 2, 3, false}, // Metformin 20:00, 3 days ago — missed
		{2, 4, 2, true},  // Vitamin D3 20:00, 2 days ago — taken
		{0, 0, 1, false}, // Metformin 08:00, 1 day ago — missed
	}

	for _, pe := range past {
		s := schedules[pe.schedIdx]
		scheduledAt := now.AddDate(0, 0, -pe.daysAgo)
		// Parse time_of_day to set hour/minute.
		var h, m int
		fmt.Sscanf(s.tod, "%d:%d", &h, &m)
		scheduledAt = time.Date(scheduledAt.Year(), scheduledAt.Month(), scheduledAt.Day(),
			h, m, 0, 0, scheduledAt.Location())

		status := "missed"
		var completedAt *time.Time
		confirmedByDevice := false
		if pe.completed {
			status = "completed"
			t := scheduledAt.Add(time.Duration(rng.Intn(300)+60) * time.Second) // 1-6 min later
			completedAt = &t
			confirmedByDevice = true
		}

		if completedAt != nil {
			_, err = tx.Exec(`INSERT INTO events (medication_id, schedule_id, scheduled_at, completed_at, status, confirmed_by_device)
				VALUES (?, ?, ?, ?, ?, ?)`,
				medIDs[pe.medIdx], schedIDs[pe.schedIdx], scheduledAt.Format(time.RFC3339),
				completedAt.Format(time.RFC3339), status, confirmedByDevice)
		} else {
			_, err = tx.Exec(`INSERT INTO events (medication_id, schedule_id, scheduled_at, status, confirmed_by_device)
				VALUES (?, ?, ?, ?, ?)`,
				medIDs[pe.medIdx], schedIDs[pe.schedIdx], scheduledAt.Format(time.RFC3339),
				status, confirmedByDevice)
		}
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}
