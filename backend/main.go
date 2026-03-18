// med-reminder backend — main entrypoint.
//
// Serves REST API, WebSocket endpoints, and runs the cron scheduler.
// All state persists in SQLite at ./data/meds.db.
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"med-reminder/backend/db"
	"med-reminder/backend/handlers"
	"med-reminder/backend/scheduler"

	"github.com/gorilla/mux"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	// ── Database ────────────────────────────────────────────────────────
	database, err := db.Open("./data")
	if err != nil {
		log.Fatalf("db.Open: %v", err)
	}
	defer database.Close()

	// ── WebSocket Hub ───────────────────────────────────────────────────
	hub := handlers.NewHub(database)

	// ── Scheduler ───────────────────────────────────────────────────────
	sched := scheduler.New(database, hub)
	if err := sched.Start(); err != nil {
		log.Fatalf("scheduler.Start: %v", err)
	}
	defer sched.Stop()

	// ── Handlers ────────────────────────────────────────────────────────
	medH := &handlers.MedicationHandler{DB: database}
	schedH := &handlers.ScheduleHandler{DB: database, OnChange: func() {
		if err := sched.Reload(); err != nil {
			log.Printf("scheduler reload: %v", err)
		}
	}}
	eventH := &handlers.EventHandler{DB: database, Hub: hub}

	// ── Router ──────────────────────────────────────────────────────────
	r := mux.NewRouter()

	// CORS middleware.
	r.Use(corsMiddleware)

	// REST API
	api := r.PathPrefix("/api").Subrouter()

	api.HandleFunc("/medications", medH.ListMedications).Methods("GET", "OPTIONS")
	api.HandleFunc("/medications", medH.CreateMedication).Methods("POST", "OPTIONS")
	api.HandleFunc("/medications/{id}", medH.UpdateMedication).Methods("PUT", "OPTIONS")
	api.HandleFunc("/medications/{id}", medH.DeleteMedication).Methods("DELETE", "OPTIONS")

	api.HandleFunc("/schedules", schedH.ListSchedules).Methods("GET", "OPTIONS")
	api.HandleFunc("/schedules", schedH.CreateSchedule).Methods("POST", "OPTIONS")
	api.HandleFunc("/schedules/{id}", schedH.DeleteSchedule).Methods("DELETE", "OPTIONS")

	api.HandleFunc("/events", eventH.ListEvents).Methods("GET", "OPTIONS")
	api.HandleFunc("/status", eventH.GetStatus).Methods("GET", "OPTIONS")
	api.HandleFunc("/debug/trigger", eventH.DebugTrigger).Methods("POST", "OPTIONS")

	// WebSocket endpoints
	r.HandleFunc("/ws/caregiver", hub.HandleCaregiverWS)
	r.HandleFunc("/ws/device", hub.HandleDeviceWS)

	// ── Server ──────────────────────────────────────────────────────────
	addr := ":8080"
	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown.
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigCh
		log.Printf("Received %v, shutting down …", sig)

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("HTTP shutdown: %v", err)
		}
	}()

	log.Printf("Backend listening on %s", addr)
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("ListenAndServe: %v", err)
	}
	log.Println("Server stopped.")
}

// corsMiddleware adds CORS headers for the Vite dev server.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
