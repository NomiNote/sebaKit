// Package handlers implements WebSocket hub for caregiver + device connections.
package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ─── Wire-protocol message types ────────────────────────────────────────────

// DeviceHello is sent by the simulator on connect.
type DeviceHello struct {
	Type     string `json:"type"`
	DeviceID string `json:"deviceId"`
}

// TriggerMsg is sent from backend → device.
type TriggerMsg struct {
	Type           string `json:"type"`
	EventID        int64  `json:"eventId"`
	MedicationName string `json:"medicationName"`
}

// AckMsg is sent from device → backend.
type AckMsg struct {
	Type    string `json:"type"`
	EventID int64  `json:"eventId"`
	Status  string `json:"status"`
}

// CaregiverMsg is broadcast from backend → caregiver browsers.
type CaregiverMsg struct {
	Type        string `json:"type"`
	EventID     int64  `json:"eventId"`
	ConfirmedAt string `json:"confirmedAt,omitempty"`
	MedName     string `json:"medicationName,omitempty"`
	ScheduledAt string `json:"scheduledAt,omitempty"`
}

// StatusMsg is sent to caregivers on connect and on device connect/disconnect.
type StatusMsg struct {
	Type            string `json:"type"`
	DeviceConnected bool   `json:"deviceConnected"`
}

// ─── Hub ────────────────────────────────────────────────────────────────────

// Hub manages WebSocket connections for caregivers and the IoT device.
type Hub struct {
	db         *sql.DB
	caregivers map[*websocket.Conn]bool
	device     *websocket.Conn
	mu         sync.RWMutex

	// pendingTimers tracks cancel funcs for missed-timeout goroutines keyed by eventID.
	pendingTimers map[int64]func()
	timerMu       sync.Mutex

	upgrader websocket.Upgrader
}

// NewHub creates a new WebSocket hub.
func NewHub(db *sql.DB) *Hub {
	return &Hub{
		db:            db,
		caregivers:    make(map[*websocket.Conn]bool),
		pendingTimers: make(map[int64]func()),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true }, // allow all origins for demo
		},
	}
}

// DeviceConnected reports whether the simulator is online.
func (h *Hub) DeviceConnected() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.device != nil
}

// ─── Caregiver endpoint ─────────────────────────────────────────────────────

// HandleCaregiverWS upgrades HTTP → WS for browser clients.
func (h *Hub) HandleCaregiverWS(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws/caregiver upgrade: %v", err)
		return
	}

	h.mu.Lock()
	h.caregivers[conn] = true
	h.mu.Unlock()

	log.Printf("Caregiver connected (%d total)", len(h.caregivers))

	// Send current device status immediately.
	_ = conn.WriteJSON(StatusMsg{Type: "status", DeviceConnected: h.DeviceConnected()})

	// Keep connection alive; read loop discards client messages.
	defer func() {
		h.mu.Lock()
		delete(h.caregivers, conn)
		h.mu.Unlock()
		conn.Close()
		log.Println("Caregiver disconnected")
	}()

	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}

// ─── Device endpoint ────────────────────────────────────────────────────────

// HandleDeviceWS upgrades HTTP → WS for the IoT simulator.
func (h *Hub) HandleDeviceWS(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws/device upgrade: %v", err)
		return
	}

	log.Println("Device connected")

	h.mu.Lock()
	h.device = conn
	h.mu.Unlock()

	h.broadcastStatus()

	defer func() {
		h.mu.Lock()
		if h.device == conn {
			h.device = nil
		}
		h.mu.Unlock()
		conn.Close()
		log.Println("Device disconnected")
		h.broadcastStatus()
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		h.handleDeviceMessage(raw)
	}
}

func (h *Hub) handleDeviceMessage(raw []byte) {
	var base struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(raw, &base); err != nil {
		log.Printf("device msg parse: %v", err)
		return
	}

	switch base.Type {
	case "hello":
		var hello DeviceHello
		json.Unmarshal(raw, &hello)
		log.Printf("Device identified: %s", hello.DeviceID)

	case "ack":
		var ack AckMsg
		if err := json.Unmarshal(raw, &ack); err != nil {
			log.Printf("ack parse: %v", err)
			return
		}
		h.handleAck(ack)

	default:
		log.Printf("unknown device message type: %s", base.Type)
	}
}

// handleAck processes a device acknowledgement: marks event completed and broadcasts.
func (h *Hub) handleAck(ack AckMsg) {
	now := time.Now().UTC().Format(time.RFC3339)

	_, err := h.db.Exec(
		`UPDATE events SET status='completed', confirmed_by_device=1, completed_at=? WHERE id=?`,
		now, ack.EventID,
	)
	if err != nil {
		log.Printf("ack db update: %v", err)
		return
	}

	// Cancel the missed-timeout goroutine.
	h.timerMu.Lock()
	if cancel, ok := h.pendingTimers[ack.EventID]; ok {
		cancel()
		delete(h.pendingTimers, ack.EventID)
	}
	h.timerMu.Unlock()

	log.Printf("Event %d completed (device confirmed)", ack.EventID)

	h.BroadcastToCaregivers(CaregiverMsg{
		Type:        "completed",
		EventID:     ack.EventID,
		ConfirmedAt: now,
	})
}

// ─── Trigger & Broadcast ───────────────────────────────────────────────────

// TriggerDevice creates a pending event and sends a trigger to the device.
// Returns the new event ID.
func (h *Hub) TriggerDevice(medicationID, scheduleID int64, medName string) (int64, error) {
	now := time.Now().UTC().Format(time.RFC3339)

	res, err := h.db.Exec(
		`INSERT INTO events (medication_id, schedule_id, scheduled_at, status) VALUES (?, ?, ?, 'pending')`,
		medicationID, scheduleID, now,
	)
	if err != nil {
		return 0, fmt.Errorf("insert event: %w", err)
	}
	eventID, _ := res.LastInsertId()

	h.mu.RLock()
	dev := h.device
	h.mu.RUnlock()

	if dev != nil {
		msg := TriggerMsg{Type: "trigger", EventID: eventID, MedicationName: medName}
		h.mu.Lock()
		err = dev.WriteJSON(msg)
		h.mu.Unlock()
		if err != nil {
			log.Printf("send trigger to device: %v", err)
		}
	} else {
		log.Println("No device connected — trigger queued as pending")
	}

	// Notify caregivers about the trigger.
	h.BroadcastToCaregivers(CaregiverMsg{
		Type:        "trigger",
		EventID:     eventID,
		MedName:     medName,
		ScheduledAt: now,
	})

	// Start 10-minute timeout goroutine.
	h.startMissedTimer(eventID)

	return eventID, nil
}

// startMissedTimer starts a goroutine that marks the event as missed after 10 minutes
// unless cancelled (i.e., ack received).
func (h *Hub) startMissedTimer(eventID int64) {
	done := make(chan struct{})
	cancel := func() { close(done) }

	h.timerMu.Lock()
	h.pendingTimers[eventID] = cancel
	h.timerMu.Unlock()

	go func() {
		select {
		case <-done:
			return // ack received, timer cancelled
		case <-time.After(10 * time.Minute):
			h.BroadcastMissed(eventID)
			h.timerMu.Lock()
			delete(h.pendingTimers, eventID)
			h.timerMu.Unlock()
		}
	}()
}

// BroadcastMissed marks an event as missed in the DB and broadcasts to caregivers.
func (h *Hub) BroadcastMissed(eventID int64) {
	_, err := h.db.Exec(`UPDATE events SET status='missed' WHERE id=? AND status='pending'`, eventID)
	if err != nil {
		log.Printf("missed db update: %v", err)
		return
	}

	log.Printf("Event %d marked as missed", eventID)

	h.BroadcastToCaregivers(CaregiverMsg{
		Type:    "missed",
		EventID: eventID,
	})
}

// BroadcastToCaregivers sends a JSON message to all connected caregiver browsers.
func (h *Hub) BroadcastToCaregivers(msg interface{}) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for conn := range h.caregivers {
		if err := conn.WriteJSON(msg); err != nil {
			log.Printf("broadcast to caregiver: %v", err)
		}
	}
}

func (h *Hub) broadcastStatus() {
	h.BroadcastToCaregivers(StatusMsg{
		Type:            "status",
		DeviceConnected: h.DeviceConnected(),
	})
}

// PendingCount returns the number of events with status='pending'.
func (h *Hub) PendingCount() int {
	var count int
	h.db.QueryRow(`SELECT COUNT(*) FROM events WHERE status='pending'`).Scan(&count)
	return count
}
