package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
)

// Medication represents a row in the medications table.
type Medication struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Dose      string `json:"dose"`
	Notes     string `json:"notes"`
	CreatedAt string `json:"createdAt"`
}

// MedicationInput is the JSON body for create/update.
type MedicationInput struct {
	Name  string `json:"name"`
	Dose  string `json:"dose"`
	Notes string `json:"notes"`
}

// MedicationHandler provides CRUD for the medications table.
type MedicationHandler struct {
	DB *sql.DB
}

// ListMedications — GET /api/medications
func (h *MedicationHandler) ListMedications(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.QueryContext(r.Context(),
		`SELECT id, name, dose, COALESCE(notes,''), created_at FROM medications ORDER BY id`)
	if err != nil {
		httpError(w, http.StatusInternalServerError, "query medications: %v", err)
		return
	}
	defer rows.Close()

	meds := []Medication{}
	for rows.Next() {
		var m Medication
		if err := rows.Scan(&m.ID, &m.Name, &m.Dose, &m.Notes, &m.CreatedAt); err != nil {
			httpError(w, http.StatusInternalServerError, "scan: %v", err)
			return
		}
		meds = append(meds, m)
	}
	writeJSON(w, http.StatusOK, meds)
}

// CreateMedication — POST /api/medications
func (h *MedicationHandler) CreateMedication(w http.ResponseWriter, r *http.Request) {
	var in MedicationInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpError(w, http.StatusBadRequest, "invalid body: %v", err)
		return
	}
	if in.Name == "" || in.Dose == "" {
		httpError(w, http.StatusBadRequest, "name and dose required")
		return
	}

	res, err := h.DB.ExecContext(r.Context(),
		`INSERT INTO medications (name, dose, notes) VALUES (?, ?, ?)`,
		in.Name, in.Dose, in.Notes)
	if err != nil {
		httpError(w, http.StatusInternalServerError, "insert: %v", err)
		return
	}
	id, _ := res.LastInsertId()

	var m Medication
	h.DB.QueryRowContext(r.Context(),
		`SELECT id, name, dose, COALESCE(notes,''), created_at FROM medications WHERE id=?`, id).
		Scan(&m.ID, &m.Name, &m.Dose, &m.Notes, &m.CreatedAt)

	writeJSON(w, http.StatusCreated, m)
}

// UpdateMedication — PUT /api/medications/{id}
func (h *MedicationHandler) UpdateMedication(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(mux.Vars(r)["id"], 10, 64)
	if err != nil {
		httpError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var in MedicationInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpError(w, http.StatusBadRequest, "invalid body: %v", err)
		return
	}

	result, err := h.DB.ExecContext(r.Context(),
		`UPDATE medications SET name=?, dose=?, notes=? WHERE id=?`,
		in.Name, in.Dose, in.Notes, id)
	if err != nil {
		httpError(w, http.StatusInternalServerError, "update: %v", err)
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		httpError(w, http.StatusNotFound, "medication not found")
		return
	}

	var m Medication
	h.DB.QueryRowContext(r.Context(),
		`SELECT id, name, dose, COALESCE(notes,''), created_at FROM medications WHERE id=?`, id).
		Scan(&m.ID, &m.Name, &m.Dose, &m.Notes, &m.CreatedAt)

	writeJSON(w, http.StatusOK, m)
}

// DeleteMedication — DELETE /api/medications/{id}
func (h *MedicationHandler) DeleteMedication(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(mux.Vars(r)["id"], 10, 64)
	if err != nil {
		httpError(w, http.StatusBadRequest, "invalid id")
		return
	}

	result, err := h.DB.ExecContext(r.Context(), `DELETE FROM medications WHERE id=?`, id)
	if err != nil {
		httpError(w, http.StatusInternalServerError, "delete: %v", err)
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		httpError(w, http.StatusNotFound, "medication not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── helpers ────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func httpError(w http.ResponseWriter, status int, format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	log.Printf("HTTP %d: %s", status, msg)
	http.Error(w, msg, status)
}
