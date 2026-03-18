# med-reminder

A local demo of a medication reminder IoT system. A caregiver monitors a
patient via a React web app. At scheduled times, the Go backend triggers an
IoT pill-box device over WebSocket. The device buzzes until the patient
physically opens it (reed switch simulation). The acknowledgement flows back,
completing the loop.

## Architecture

```
┌────────────┐   REST/WS   ┌───────────┐   WS   ┌────────────┐
│  React App │ ←──────────→ │ Go Backend│ ←─────→ │ Simulator  │
│  (Browser) │  :5173→:8080 │  (:8080)  │        │ (CLI)      │
└────────────┘              │  SQLite   │        └────────────┘
                            └───────────┘
```

- **Go backend** (`:8080`) serves REST API + two WebSocket endpoints
- **Scheduler goroutine** fires cron jobs at medication times, triggering the IoT device (simulator) via `/ws/device`
- **Simulator** acks after a simulated delay (4-8 seconds)
- **Backend** records completion and broadcasts to all caregiver browser clients over `/ws/caregiver`
- **SQLite** persists all state at `./backend/data/meds.db`

## Quick Start

```bash
# Terminal 1 — Backend
cd backend && go run .

# Terminal 2 — IoT Simulator
cd simulator && go run .

# Terminal 3 — Frontend
cd frontend && npm install && npm run dev
```

Open **http://localhost:5173** in your browser.

## Trigger a Demo Reminder Manually

```bash
curl -X POST http://localhost:8080/api/debug/trigger
```

This fires the first active schedule immediately. The simulator will receive the
trigger, wait a few seconds, then ack — and the browser dashboard will update
in real-time.

## API Endpoints

| Method | Path                    | Description                    |
|--------|------------------------|--------------------------------|
| GET    | `/api/medications`      | List all medications           |
| POST   | `/api/medications`      | Create medication              |
| PUT    | `/api/medications/:id`  | Update medication              |
| DELETE | `/api/medications/:id`  | Delete medication              |
| GET    | `/api/schedules`        | List schedules (with med name) |
| POST   | `/api/schedules`        | Create schedule                |
| DELETE | `/api/schedules/:id`    | Delete schedule                |
| GET    | `/api/events?days=7`    | List events (with med name)    |
| GET    | `/api/status`           | Device connected + pending     |
| POST   | `/api/debug/trigger`    | Fire next due immediately      |
| WS     | `/ws/caregiver`         | Browser WebSocket              |
| WS     | `/ws/device`            | Device WebSocket               |

## Tech Stack

- **Backend:** Go 1.22+, gorilla/mux, gorilla/websocket, mattn/go-sqlite3, robfig/cron/v3
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS v3, React Router v6, Zustand
- **Database:** SQLite
- **Simulator:** Standalone Go CLI
