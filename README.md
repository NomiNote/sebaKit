# med-reminder

[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A local demo of a medication reminder IoT system. A caregiver monitors a
patient via a React web app. At scheduled times, the Go backend triggers an
IoT pill-box device over WebSocket. The device buzzes until the patient
physically opens it (reed switch simulation). The acknowledgement flows back,
completing the loop.

## Architecture

```
┌────────────┐   REST/WS    ┌───────────┐   WS     ┌────────────┐
│  React App │ ←──────────→ │ Go Backend│ ←─────→  │ Simulator  │
│  (Browser) │  :5173→:8080 │  (:8080)  │          │ (CLI)      │
└────────────┘              │  SQLite   │          └────────────┘
                            └───────────┘
```

- **Go backend** (`:8080`) serves REST API + two WebSocket endpoints
- **Scheduler goroutine** fires cron jobs at medication times, triggering the IoT device (simulator) via `/ws/device`
- **Simulator** acks after a simulated delay (4-8 seconds)
- **Backend** records completion and broadcasts to all caregiver browser clients over `/ws/caregiver`
- **SQLite** persists all state at `./backend/data/meds.db`

## Quick Start

### Option 1 — Docker (Recommended)

Run the frontend and backend together in a single container with split-pane logs:

```bash
# Build the image
docker build -t sebakit .

# Run with interactive tmux session
docker run -it --rm -p 5173:5173 -p 8080:8080 sebakit
```

This opens a `tmux` session with two panes:
- **Left pane** — Go backend logs
- **Right pane** — Vite dev server logs

> **Tip:** Use `Ctrl+B` then arrow keys to switch between tmux panes.
> To exit, press `Ctrl+B` then `d` to detach, or `Ctrl+C` in each pane.

To persist the SQLite database between runs, mount a volume:

```bash
docker run -it --rm -p 5173:5173 -p 8080:8080 -v sebakit-data:/app/data sebakit
```

### Option 2 — Manual

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
| GET    | `/api/today-status`     | Today's medication status      |
| GET    | `/api/settings`         | Get app settings               |
| PUT    | `/api/settings`         | Update app settings            |
| POST   | `/api/debug/trigger`    | Fire next due immediately      |
| WS     | `/ws/caregiver`         | Browser WebSocket              |
| WS     | `/ws/device`            | Device WebSocket               |

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | Go 1.25, Gin, gorilla/websocket, modernc/sqlite, robfig/cron/v3 |
| **Frontend** | React 18, Vite 6, TypeScript, Tailwind CSS 3, React Router 6, Zustand |
| **Database** | SQLite |
| **Simulator** | Standalone Go CLI |
| **DevOps** | Docker, multi-stage build, tmux |
