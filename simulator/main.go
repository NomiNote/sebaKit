// Simulator — standalone CLI that mimics an IoT pill-box device.
//
// Connects to the backend via WebSocket, receives trigger messages,
// simulates a patient opening the box after a random delay, and sends acks.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

// Wire-protocol messages (mirrored from backend).

type HelloMsg struct {
	Type     string `json:"type"`
	DeviceID string `json:"deviceId"`
}

type TriggerMsg struct {
	Type           string `json:"type"`
	EventID        int64  `json:"eventId"`
	MedicationName string `json:"medicationName"`
}

type AckMsg struct {
	Type    string `json:"type"`
	EventID int64  `json:"eventId"`
	Status  string `json:"status"`
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	url := os.Getenv("BACKEND_WS_URL")
	if url == "" {
		url = "ws://localhost:8080/ws/device"
	}

	// Reconnect loop with retry.
	var conn *websocket.Conn
	for {
		var err error
		conn, _, err = websocket.DefaultDialer.Dial(url, nil)
		if err != nil {
			fmt.Printf("Connecting to %s … (retrying in 3s)\n", url)
			time.Sleep(3 * time.Second)
			continue
		}
		break
	}
	defer conn.Close()

	fmt.Println("Connected to backend.")

	// Send hello handshake.
	hello := HelloMsg{Type: "hello", DeviceID: "pill-box-01"}
	if err := conn.WriteJSON(hello); err != nil {
		log.Fatalf("send hello: %v", err)
	}

	// Handle SIGINT/SIGTERM for clean shutdown.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		fmt.Println("\nShutting down simulator …")
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
		os.Exit(0)
	}()

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	// Main receive loop.
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			log.Printf("read error: %v", err)
			fmt.Println("Disconnected. Exiting.")
			return
		}

		var base struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(raw, &base); err != nil {
			log.Printf("parse: %v", err)
			continue
		}

		switch base.Type {
		case "trigger":
			var trigger TriggerMsg
			json.Unmarshal(raw, &trigger)

			fmt.Printf("\n🔔 ALERT: Time to take %s (event %d)\n", trigger.MedicationName, trigger.EventID)
			fmt.Println("   Waiting for patient to open pill box …")

			// Simulate patient opening the box after 4–8 seconds.
			delay := time.Duration(4+rng.Intn(5)) * time.Second
			time.Sleep(delay)

			ack := AckMsg{
				Type:    "ack",
				EventID: trigger.EventID,
				Status:  "completed",
			}
			if err := conn.WriteJSON(ack); err != nil {
				log.Printf("send ack: %v", err)
				continue
			}
			fmt.Printf("   ✅ Pill box opened — ack sent for event %d\n", trigger.EventID)

		default:
			fmt.Printf("Unknown message type: %s\n", base.Type)
		}
	}
}
