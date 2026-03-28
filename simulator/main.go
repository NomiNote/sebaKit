// Simulator — interactive CLI that mimics an IoT pill-box device.
//
// Connects to the backend via WebSocket, receives trigger messages,
// and allows the user to interact: list medications, view pending alerts,
// acknowledge (box opened) or miss doses manually.
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"

	"github.com/gorilla/websocket"
)

// ─── Wire-protocol messages ─────────────────────────────────────────────────

type HelloMsg struct {
	Type     string `json:"type"`
	DeviceID string `json:"deviceId"`
}

type TriggerMsg struct {
	Type           string `json:"type"`
	EventID        int64  `json:"eventId"`
	MedicationName string `json:"medicationName"`
	ScheduledAt    string `json:"scheduledAt"`
}

type AckMsg struct {
	Type    string `json:"type"`
	EventID int64  `json:"eventId"`
	Status  string `json:"status"` // "completed" or "missed"
}

// ─── REST types ─────────────────────────────────────────────────────────────

type Medication struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Dose  string `json:"dose"`
	Notes string `json:"notes"`
}

type Schedule struct {
	ID             int64   `json:"id"`
	MedicationName string  `json:"medicationName"`
	TimeOfDay      string  `json:"timeOfDay"`
	DaysOfWeek     string  `json:"daysOfWeek"`
	StartDate      string  `json:"startDate"`
	EndDate        *string `json:"endDate"`
}

type TodayDose struct {
	ScheduleID     int64  `json:"scheduleId"`
	MedicationName string `json:"medicationName"`
	Dose           string `json:"dose"`
	TimeOfDay      string `json:"timeOfDay"`
	Status         string `json:"status"`
}

// ─── Pending alert store ────────────────────────────────────────────────────

type PendingAlert struct {
	EventID        int64
	MedicationName string
	ScheduledAt    string
}

var (
	pendingMu     sync.Mutex
	pendingAlerts []PendingAlert
)

func addPending(a PendingAlert) {
	pendingMu.Lock()
	defer pendingMu.Unlock()
	pendingAlerts = append(pendingAlerts, a)
}

func removePending(eventID int64) {
	pendingMu.Lock()
	defer pendingMu.Unlock()
	for i, a := range pendingAlerts {
		if a.EventID == eventID {
			pendingAlerts = append(pendingAlerts[:i], pendingAlerts[i+1:]...)
			return
		}
	}
}

func listPending() []PendingAlert {
	pendingMu.Lock()
	defer pendingMu.Unlock()
	out := make([]PendingAlert, len(pendingAlerts))
	copy(out, pendingAlerts)
	return out
}

// ─── Main ───────────────────────────────────────────────────────────────────

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	baseURL := os.Getenv("BACKEND_URL")
	if baseURL == "" {
		baseURL = "http://localhost:8080"
	}

	wsURL := os.Getenv("BACKEND_WS_URL")
	if wsURL == "" {
		wsURL = "ws://localhost:8080/ws/device"
	}

	// ── Connect WebSocket ──────────────────────────────────────────────

	fmt.Printf("Connecting to %s …\n", wsURL)
	var conn *websocket.Conn
	for {
		var err error
		conn, _, err = websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			fmt.Println("  Retrying in 3s …")
			select {}
		}
		break
	}
	defer conn.Close()

	fmt.Println("✅ Connected to backend.\n")

	// Send hello handshake.
	hello := HelloMsg{Type: "hello", DeviceID: "pill-box-01"}
	if err := conn.WriteJSON(hello); err != nil {
		log.Fatalf("send hello: %v", err)
	}

	// Handle SIGINT/SIGTERM.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		fmt.Println("\nShutting down simulator …")
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
		os.Exit(0)
	}()

	// ── Background: receive WebSocket messages ─────────────────────────

	go func() {
		for {
			_, raw, err := conn.ReadMessage()
			if err != nil {
				fmt.Println("\n⚠️  Disconnected from backend.")
				os.Exit(1)
			}

			var base struct {
				Type string `json:"type"`
			}
			if err := json.Unmarshal(raw, &base); err != nil {
				continue
			}

			switch base.Type {
			case "trigger":
				var trigger TriggerMsg
				json.Unmarshal(raw, &trigger)
				addPending(PendingAlert{
					EventID:        trigger.EventID,
					MedicationName: trigger.MedicationName,
					ScheduledAt:    trigger.ScheduledAt,
				})
				fmt.Printf("\n\n🔔 ALERT: Time to take %s (event #%d)\n", trigger.MedicationName, trigger.EventID)
				fmt.Print("sim> ")
			default:
				// silently ignore other messages
			}
		}
	}()

	// ── Interactive menu ───────────────────────────────────────────────

	scanner := bufio.NewScanner(os.Stdin)
	printMenu()

	for {
		fmt.Print("sim> ")
		if !scanner.Scan() {
			break
		}
		input := strings.TrimSpace(scanner.Text())
		if input == "" {
			continue
		}

		switch input {
		case "1":
			fetchMedications(baseURL)
		case "2":
			fetchSchedules(baseURL)
		case "3":
			fetchTodayStatus(baseURL)
		case "4":
			showPendingAlerts()
		case "5":
			handleAck(conn, scanner, "completed")
		case "6":
			handleAck(conn, scanner, "missed")
		case "7":
			triggerDebug(baseURL)
		case "h", "help":
			printMenu()
		case "q", "quit", "exit":
			fmt.Println("Bye!")
			return
		default:
			fmt.Println("Unknown command. Type 'h' for help.")
		}
		fmt.Println()
	}
}

// ─── Menu ───────────────────────────────────────────────────────────────────

func printMenu() {
	fmt.Println("┌──────────────────────────────────────┐")
	fmt.Println("│   🏥 Pill Box Simulator              │")
	fmt.Println("├──────────────────────────────────────┤")
	fmt.Println("│  1  List medications                 │")
	fmt.Println("│  2  List schedules                   │")
	fmt.Println("│  3  Today's doses (status)           │")
	fmt.Println("│  4  Show pending alerts              │")
	fmt.Println("│  5  Open box (ack completed)         │")
	fmt.Println("│  6  Mark missed                      │")
	fmt.Println("│  7  Debug trigger                    │")
	fmt.Println("│  h  Help   q  Quit                   │")
	fmt.Println("└──────────────────────────────────────┘")
	fmt.Println()
}

// ─── REST Fetchers ──────────────────────────────────────────────────────────

func fetchMedications(base string) {
	resp, err := http.Get(base + "/api/medications")
	if err != nil {
		fmt.Printf("  ❌ Error: %v\n", err)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var meds []Medication
	if err := json.Unmarshal(body, &meds); err != nil {
		fmt.Printf("  ❌ Parse error: %v\n", err)
		return
	}

	if len(meds) == 0 {
		fmt.Println("  No medications found.")
		return
	}

	fmt.Println("  ┌─────┬──────────────────┬──────────┬─────────────────┐")
	fmt.Println("  │  ID │ Name             │ Dose     │ Notes           │")
	fmt.Println("  ├─────┼──────────────────┼──────────┼─────────────────┤")
	for _, m := range meds {
		fmt.Printf("  │ %3d │ %-16s │ %-8s │ %-15s │\n", m.ID, truncate(m.Name, 16), truncate(m.Dose, 8), truncate(m.Notes, 15))
	}
	fmt.Println("  └─────┴──────────────────┴──────────┴─────────────────┘")
}

func fetchSchedules(base string) {
	resp, err := http.Get(base + "/api/schedules")
	if err != nil {
		fmt.Printf("  ❌ Error: %v\n", err)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var scheds []Schedule
	if err := json.Unmarshal(body, &scheds); err != nil {
		fmt.Printf("  ❌ Parse error: %v\n", err)
		return
	}

	if len(scheds) == 0 {
		fmt.Println("  No schedules found.")
		return
	}

	fmt.Println("  ┌─────┬──────────────────┬───────┬─────────────┬────────────┐")
	fmt.Println("  │  ID │ Medication       │ Time  │ Days        │ Dates      │")
	fmt.Println("  ├─────┼──────────────────┼───────┼─────────────┼────────────┤")
	for _, s := range scheds {
		endStr := "ongoing"
		if s.EndDate != nil && *s.EndDate != "" {
			endStr = *s.EndDate
		}
		dates := fmt.Sprintf("%s→%s", s.StartDate[5:], endStr)
		if len(dates) > 10 {
			dates = dates[:10]
		}
		fmt.Printf("  │ %3d │ %-16s │ %5s │ %-11s │ %-10s │\n",
			s.ID, truncate(s.MedicationName, 16), s.TimeOfDay, truncate(formatDays(s.DaysOfWeek), 11), dates)
	}
	fmt.Println("  └─────┴──────────────────┴───────┴─────────────┴────────────┘")
}

func fetchTodayStatus(base string) {
	resp, err := http.Get(base + "/api/today-status")
	if err != nil {
		fmt.Printf("  ❌ Error: %v\n", err)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var doses []TodayDose
	if err := json.Unmarshal(body, &doses); err != nil {
		fmt.Printf("  ❌ Parse error: %v\n", err)
		return
	}

	if len(doses) == 0 {
		fmt.Println("  No doses scheduled for today.")
		return
	}

	statusIcon := map[string]string{
		"upcoming":  "⏳",
		"due":       "⚠️",
		"pending":   "🔔",
		"completed": "✅",
		"missed":    "❌",
	}

	fmt.Println("  ┌──────────────────┬──────────┬───────┬───────────┐")
	fmt.Println("  │ Medication       │ Dose     │ Time  │ Status    │")
	fmt.Println("  ├──────────────────┼──────────┼───────┼───────────┤")
	for _, d := range doses {
		icon := statusIcon[d.Status]
		if icon == "" {
			icon = "?"
		}
		fmt.Printf("  │ %-16s │ %-8s │ %5s │ %s %-7s │\n",
			truncate(d.MedicationName, 16), truncate(d.Dose, 8), d.TimeOfDay, icon, d.Status)
	}
	fmt.Println("  └──────────────────┴──────────┴───────┴───────────┘")
}

// ─── Pending Alerts & Ack ───────────────────────────────────────────────────

func showPendingAlerts() {
	alerts := listPending()
	if len(alerts) == 0 {
		fmt.Println("  No pending alerts.")
		return
	}
	fmt.Println("  Pending alerts:")
	for i, a := range alerts {
		fmt.Printf("    %d) Event #%d — %s\n", i+1, a.EventID, a.MedicationName)
	}
}

func handleAck(conn *websocket.Conn, scanner *bufio.Scanner, status string) {
	alerts := listPending()
	if len(alerts) == 0 {
		fmt.Println("  No pending alerts to respond to.")
		return
	}

	fmt.Println("  Pending alerts:")
	for i, a := range alerts {
		fmt.Printf("    %d) Event #%d — %s\n", i+1, a.EventID, a.MedicationName)
	}

	fmt.Print("  Select alert number (or 'all'): ")
	if !scanner.Scan() {
		return
	}
	choice := strings.TrimSpace(scanner.Text())

	var toAck []PendingAlert
	if choice == "all" {
		toAck = alerts
	} else {
		idx, err := strconv.Atoi(choice)
		if err != nil || idx < 1 || idx > len(alerts) {
			fmt.Println("  Invalid selection.")
			return
		}
		toAck = []PendingAlert{alerts[idx-1]}
	}

	for _, a := range toAck {
		ack := AckMsg{Type: "ack", EventID: a.EventID, Status: status}
		if err := conn.WriteJSON(ack); err != nil {
			fmt.Printf("  ❌ Failed to send ack for event #%d: %v\n", a.EventID, err)
			continue
		}
		removePending(a.EventID)
		if status == "completed" {
			fmt.Printf("  ✅ Box opened — event #%d (%s) marked completed\n", a.EventID, a.MedicationName)
		} else {
			fmt.Printf("  ❌ Event #%d (%s) marked missed\n", a.EventID, a.MedicationName)
		}
	}
}

func triggerDebug(base string) {
	resp, err := http.Post(base+"/api/debug/trigger", "application/json", nil)
	if err != nil {
		fmt.Printf("  ❌ Error: %v\n", err)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		fmt.Printf("  ❌ %s: %s\n", resp.Status, string(body))
		return
	}

	var result struct {
		EventID        int64  `json:"eventId"`
		MedicationName string `json:"medicationName"`
	}
	json.Unmarshal(body, &result)
	fmt.Printf("  🔔 Triggered: %s (event #%d) — check pending alerts\n", result.MedicationName, result.EventID)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-1] + "…"
}

func formatDays(dow string) string {
	if dow == "1,2,3,4,5,6,7" {
		return "Every day"
	}
	if dow == "1,2,3,4,5" {
		return "Weekdays"
	}
	if dow == "6,7" {
		return "Weekends"
	}
	names := map[string]string{"1": "Mon", "2": "Tue", "3": "Wed", "4": "Thu", "5": "Fri", "6": "Sat", "7": "Sun"}
	parts := strings.Split(dow, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if n, ok := names[strings.TrimSpace(p)]; ok {
			out = append(out, n)
		}
	}
	return strings.Join(out, ",")
}
