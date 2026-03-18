package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
)

// Schedule represents a schedule row joined with the medication name.
type Schedule struct {
	ID             int64  `json:"id"`
	MedicationID   int64  `json:"medicationId"`
	MedicationName string `json:"medicationName"`
	TimeOfDay      string `json:"timeOfDay"`
	DaysOfWeek     string `json:"daysOfWeek"`
	Active         bool   `json:"active"`
}

// ScheduleInput is the JSON body for creating a schedule.
type ScheduleInput struct {
	MedicationID int64  `json:"medicationId"`
	TimeOfDay    string `json:"timeOfDay"`
	DaysOfWeek   string `json:"daysOfWeek"`
}

// ScheduleHandler provides endpoints for the schedules table.
type ScheduleHandler struct {
	DB       *sql.DB
	OnChange func() // called after writes to reload the cron scheduler
}

// ListSchedules — GET /api/schedules
func (h *ScheduleHandler) ListSchedules(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.QueryContext(r.Context(), `
		SELECT s.id, s.medication_id, m.name, s.time_of_day, s.days_of_week, s.active
		FROM schedules s
		JOIN medications m ON m.id = s.medication_id
		ORDER BY s.time_of_day, m.name`)
	if err != nil {
		httpError(w, http.StatusInternalServerError, "query schedules: %v", err)
		return
	}
	defer rows.Close()

	scheds := []Schedule{}
	for rows.Next() {
		var s Schedule
		if err := rows.Scan(&s.ID, &s.MedicationID, &s.MedicationName, &s.TimeOfDay, &s.DaysOfWeek, &s.Active); err != nil {
			httpError(w, http.StatusInternalServerError, "scan: %v", err)
			return
		}
		scheds = append(scheds, s)
	}
	writeJSON(w, http.StatusOK, scheds)
}

// CreateSchedule — POST /api/schedules
func (h *ScheduleHandler) CreateSchedule(w http.ResponseWriter, r *http.Request) {
	var in ScheduleInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpError(w, http.StatusBadRequest, "invalid body: %v", err)
		return
	}
	if in.MedicationID == 0 || in.TimeOfDay == "" || in.DaysOfWeek == "" {
		httpError(w, http.StatusBadRequest, "medicationId, timeOfDay, daysOfWeek required")
		return
	}

	res, err := h.DB.ExecContext(r.Context(),
		`INSERT INTO schedules (medication_id, time_of_day, days_of_week, active) VALUES (?, ?, ?, 1)`,
		in.MedicationID, in.TimeOfDay, in.DaysOfWeek)
	if err != nil {
		httpError(w, http.StatusInternalServerError, "insert: %v", err)
		return
	}
	id, _ := res.LastInsertId()

	var s Schedule
	h.DB.QueryRowContext(r.Context(), `
		SELECT s.id, s.medication_id, m.name, s.time_of_day, s.days_of_week, s.active
		FROM schedules s JOIN medications m ON m.id = s.medication_id
		WHERE s.id=?`, id).
		Scan(&s.ID, &s.MedicationID, &s.MedicationName, &s.TimeOfDay, &s.DaysOfWeek, &s.Active)

	if h.OnChange != nil {
		h.OnChange()
	}

	writeJSON(w, http.StatusCreated, s)
}

// DeleteSchedule — DELETE /api/schedules/{id}
func (h *ScheduleHandler) DeleteSchedule(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(mux.Vars(r)["id"], 10, 64)
	if err != nil {
		httpError(w, http.StatusBadRequest, "invalid id")
		return
	}

	// Manually cascade delete events associated with this schedule
	// to avoid foreign key constraint errors.
	if _, err := h.DB.ExecContext(r.Context(), `DELETE FROM events WHERE schedule_id=?`, id); err != nil {
		httpError(w, http.StatusInternalServerError, "delete associated events: %v", err)
		return
	}

	result, err := h.DB.ExecContext(r.Context(), `DELETE FROM schedules WHERE id=?`, id)
	if err != nil {
		httpError(w, http.StatusInternalServerError, "delete schedule: %v", err)
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		httpError(w, http.StatusNotFound, "schedule not found")
		return
	}

	if h.OnChange != nil {
		h.OnChange()
	}

	w.WriteHeader(http.StatusNoContent)
}
