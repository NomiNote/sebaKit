package handlers

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Event represents an event row joined with medication name.
type Event struct {
	ID                int64  `json:"id"`
	MedicationID      int64  `json:"medicationId"`
	MedicationName    string `json:"medicationName"`
	ScheduleID        *int64 `json:"scheduleId"`
	ScheduledAt       string `json:"scheduledAt"`
	CompletedAt       string `json:"completedAt,omitempty"`
	Status            string `json:"status"`
	ConfirmedByDevice bool   `json:"confirmedByDevice"`
}

// EventHandler provides endpoints for the events table.
type EventHandler struct {
	DB  *sql.DB
	Hub *Hub // needed for status + debug trigger
}

// ListEvents — GET /api/events?days=7
func (h *EventHandler) ListEvents(c *gin.Context) {
	days := 7
	if d := c.Query("days"); d != "" {
		if parsed, err := strconv.Atoi(d); err == nil && parsed > 0 {
			days = parsed
		}
	}

	rows, err := h.DB.QueryContext(c.Request.Context(), `
		SELECT e.id, e.medication_id, m.name,
		       e.schedule_id, e.scheduled_at,
		       COALESCE(e.completed_at,''), e.status, e.confirmed_by_device
		FROM events e
		JOIN medications m ON m.id = e.medication_id
		WHERE e.scheduled_at >= datetime('now', '-' || ? || ' days')
		ORDER BY e.scheduled_at DESC`, days)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "query events: " + err.Error()})
		return
	}
	defer rows.Close()

	events := []Event{}
	for rows.Next() {
		var ev Event
		var sid sql.NullInt64
		if err := rows.Scan(&ev.ID, &ev.MedicationID, &ev.MedicationName,
			&sid, &ev.ScheduledAt, &ev.CompletedAt, &ev.Status, &ev.ConfirmedByDevice); err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "scan: " + err.Error()})
			return
		}
		if sid.Valid {
			ev.ScheduleID = &sid.Int64
		}
		events = append(events, ev)
	}
	c.JSON(http.StatusOK, events)
}

// GetStatus — GET /api/status
func (h *EventHandler) GetStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"deviceConnected": h.Hub.DeviceConnected(),
		"pendingCount":    h.Hub.PendingCount(),
	})
}

// DebugTrigger — POST /api/debug/trigger
// Fires the first active schedule immediately for demo/testing purposes.
func (h *EventHandler) DebugTrigger(c *gin.Context) {
	var medID, schedID int64
	var medName string
	err := h.DB.QueryRowContext(c.Request.Context(), `
		SELECT s.medication_id, s.id, m.name
		FROM schedules s
		JOIN medications m ON m.id = s.medication_id
		WHERE s.active = 1
		ORDER BY s.time_of_day
		LIMIT 1`).Scan(&medID, &schedID, &medName)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "no active schedules: " + err.Error()})
		return
	}

	eventID, err := h.Hub.TriggerDevice(medID, schedID, medName)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "trigger: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"eventId":        eventID,
		"medicationName": medName,
	})
}
