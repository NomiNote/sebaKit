# sebaKit — Agent Onboarding Guide

> **What is this?** A local medication-reminder IoT demo. A caregiver monitors a patient via a React web app; at scheduled times the Go backend triggers an IoT pill-box (simulator) over WebSocket. The device buzzes until the patient opens it, then acks — completing the loop.

---

## Quick Start (3 terminals)

```bash
# 1 — Backend (Go)
cd backend && go run .

# 2 — IoT Simulator (Go)
cd simulator && go run .

# 3 — Frontend (React)
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173`. Trigger a demo reminder: `curl -X POST http://localhost:8080/api/debug/trigger`.

---

## Architecture

```
┌─────────────┐   REST / WS    ┌────────────┐    WS     ┌────────────┐
│  React App  │ ←────────────→ │ Go Backend │ ←───────→ │ Simulator  │
│  :5173      │  proxied       │  :8080     │           │ (CLI)      │
└─────────────┘                │  SQLite    │           └────────────┘
                               └────────────┘
```

- **Frontend → Backend**: Vite dev proxy forwards `/api/*` and `/ws/*` to `:8080` (see `vite.config.ts`).
- **Backend → Simulator**: Single WebSocket at `/ws/device`.
- **Backend → Browser(s)**: Broadcast WebSocket at `/ws/caregiver`.

---

## Tech Stack

| Layer      | Stack                                                                     |
|------------|---------------------------------------------------------------------------|
| Backend    | Go 1.25, **Gin**, gorilla/websocket, robfig/cron/v3, modernc.org/sqlite  |
| Frontend   | React 18, Vite 6, TypeScript 5, **Tailwind CSS v3**, React Router v6, **Zustand** |
| Database   | SQLite (WAL mode, single-connection pool) at `backend/data/meds.db`      |
| Simulator  | Standalone Go CLI, gorilla/websocket                                      |

---

## Project Layout

```
sebaKit/
├── backend/
│   ├── main.go                  # Entrypoint — Gin router, CORS, graceful shutdown
│   ├── db/
│   │   ├── schema.sql           # DDL (embedded via go:embed)
│   │   └── db.go                # Open, migrate, seed demo data
│   ├── handlers/
│   │   ├── ws.go                # WebSocket Hub — trigger, ack, broadcast, missed timers
│   │   ├── medications.go       # CRUD for medications table
│   │   ├── schedule.go          # CRUD for schedules table (+scheduler reload on change)
│   │   └── events.go            # Events list, status, debug trigger
│   ├── middleware/              # (empty — CORS is inline in main.go)
│   ├── models/                  # (empty — structs live in handlers)
│   ├── scheduler/
│   │   └── scheduler.go         # Cron engine — loads active schedules into robfig/cron
│   ├── go.mod / go.sum
│   └── data/meds.db             # Created at runtime
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Root layout + React Router routes
│   │   ├── main.tsx             # ReactDOM.createRoot entry
│   │   ├── api/
│   │   │   └── client.ts        # Typed fetch wrappers (all REST endpoints)
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts  # Connects to /ws/caregiver, dispatches to Zustand store
│   │   ├── store/
│   │   │   └── useStore.ts      # Zustand store — central app state
│   │   ├── components/
│   │   │   ├── BottomNav.tsx
│   │   │   ├── PatientCard.tsx
│   │   │   ├── MedRow.tsx
│   │   │   ├── StreakWidget.tsx
│   │   │   └── AdherenceDonut.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Schedule.tsx     # Add/delete meds + schedules
│   │   │   ├── Alert.tsx        # Active reminder alert overlay
│   │   │   └── History.tsx      # 7-day event log
│   │   └── index.css            # Tailwind directives + custom styles
│   ├── vite.config.ts           # Dev proxy to backend (:8080)
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
├── simulator/
│   ├── main.go                  # IoT device simulator CLI
│   ├── go.mod / go.sum
│   └── simulator.exe
└── README.md
```

---

## Database Schema

Four tables in `backend/db/schema.sql` (auto-applied on startup):

```sql
medications (id PK, name, dose, notes, created_at)
schedules   (id PK, medication_id FK→medications, time_of_day "HH:MM", days_of_week "1,2,...,7", active)
events      (id PK, medication_id FK, schedule_id FK, scheduled_at, completed_at, status ∈ {pending,completed,missed}, confirmed_by_device)
caregivers  (id PK, name, email)
```

- `db.Open("./data")` creates the dir, opens `meds.db` with WAL+FK pragmas, runs schema, seeds demo data (3 meds, 5 schedules, 6 past events) if empty.
- **Single-connection pool** (`SetMaxOpenConns(1)`) — SQLite limitation.

---

## REST API

| Method | Path                   | Handler                          | Notes |
|--------|------------------------|----------------------------------|-------|
| GET    | `/api/medications`     | `MedicationHandler.ListMedications` | |
| POST   | `/api/medications`     | `MedicationHandler.CreateMedication` | Body: `{name, dose, notes}` |
| PUT    | `/api/medications/:id` | `MedicationHandler.UpdateMedication` | Body: `{name, dose, notes}` |
| DELETE | `/api/medications/:id` | `MedicationHandler.DeleteMedication` | |
| GET    | `/api/schedules`       | `ScheduleHandler.ListSchedules`  | Joins med name |
| POST   | `/api/schedules`       | `ScheduleHandler.CreateSchedule` | Body: `{medicationId, timeOfDay, daysOfWeek}` — triggers `scheduler.Reload()` |
| DELETE | `/api/schedules/:id`   | `ScheduleHandler.DeleteSchedule` | Triggers `scheduler.Reload()` |
| GET    | `/api/events?days=7`   | `EventHandler.ListEvents`        | Past N days, joins med name |
| GET    | `/api/status`          | `EventHandler.GetStatus`         | Returns `{deviceConnected, pendingCount}` |
| POST   | `/api/debug/trigger`   | `EventHandler.DebugTrigger`      | Fires the first active schedule immediately |

The backend uses **Gin** (`gin-gonic/gin`). All handlers receive `*gin.Context`. JSON responses use `c.JSON()`. Path params via `c.Param("id")`, query params via `c.DefaultQuery()`.

---

## WebSocket Protocol

Two WS endpoints, both use JSON messages with a `type` field for dispatch.

### `/ws/device` (Backend ↔ Simulator)

| Direction | Type | Payload | Purpose |
|-----------|------|---------|---------|
| Device → Backend | `hello` | `{type, deviceId}` | Handshake on connect |
| Backend → Device | `trigger` | `{type, eventId, medicationName}` | Fire a reminder |
| Device → Backend | `ack` | `{type, eventId, status:"completed"}` | Patient opened pill box |

### `/ws/caregiver` (Backend → Browser)

| Type | Payload | When |
|------|---------|------|
| `status` | `{type, deviceConnected}` | On connect + device connect/disconnect |
| `trigger` | `{type, eventId, medicationName, scheduledAt}` | Reminder fired |
| `completed` | `{type, eventId, confirmedAt}` | Device ack received |
| `missed` | `{type, eventId}` | 10-min timeout expired without ack |

**Key behaviour**: When a trigger fires, a 10-minute goroutine timer starts. If no `ack` arrives, the event is marked `missed` and broadcast. If `ack` arrives, the timer is cancelled via a channel.

---

## Frontend State Management

**Zustand store** (`src/store/useStore.ts`) holds all app state:

```typescript
interface AppState {
  medications: Medication[];
  schedules: Schedule[];
  todayEvents: MedEvent[];
  weekEvents: MedEvent[];
  deviceConnected: boolean;
  activeAlert: ActiveAlert | null;  // {eventId, medicationName, scheduledAt}
}
```

- `useWebSocket` hook auto-connects to `/ws/caregiver` (with exponential backoff reconnect) and dispatches incoming messages to the store.
- When `activeAlert` is set, `App.tsx` auto-navigates to `/alert`.
- `patchEvent()` updates both `todayEvents` and `weekEvents` in-place for instant UI reactivity.

### Frontend Types (defined in `api/client.ts`)

```typescript
Medication     { id, name, dose, notes, createdAt }
MedicationInput { name, dose, notes }
Schedule       { id, medicationId, medicationName, timeOfDay, daysOfWeek, active }
ScheduleInput  { medicationId, timeOfDay, daysOfWeek }
MedEvent       { id, medicationId, medicationName, scheduleId, scheduledAt, completedAt, status, confirmedByDevice }
StatusInfo     { deviceConnected, pendingCount }
```

---

## Scheduler (Cron Engine)

`scheduler/scheduler.go` — wraps `robfig/cron/v3`.

- On `Start()` and `Reload()`, queries all active schedules and registers cron jobs.
- Converts `time_of_day` ("HH:MM") + `days_of_week` ("1,2,3,...,7" ISO) to standard cron expressions.
- Day conversion: ISO Mon=1..Sun=7 → cron Mon=1..Sat=6, Sun=0.
- Creating/deleting a schedule calls `sched.Reload()` via the `OnChange` callback in `ScheduleHandler`.

---

## Routing (Frontend)

| Path | Page Component | Purpose |
|------|---------------|---------|
| `/` | `Dashboard` | Patient status overview, streak, adherence donut, today's meds |
| `/schedule` | `Schedule` | Add/delete medications and schedules |
| `/alert` | `Alert` | Full-screen alert when a reminder fires |
| `/history` | `History` | 7-day event log |

Navigation via `BottomNav` component (persistent bottom bar).

---

## Key Patterns & Conventions

1. **No models package** — struct definitions live in the handler files and `api/client.ts`. There is no shared models package.
2. **Handler structs** — each handler group (`MedicationHandler`, `ScheduleHandler`, `EventHandler`) is a struct with `DB *sql.DB` (and optionally `Hub *handlers.Hub`). Methods are Gin handlers.
3. **Embedded SQL** — `schema.sql` is embedded via `//go:embed` and executed on startup.
4. **CORS** — inline middleware in `main.go` (`Access-Control-Allow-Origin: *`).
5. **Graceful shutdown** — backend listens for SIGINT/SIGTERM and calls `srv.Shutdown()` with 10s timeout.
6. **Vite proxy** — in dev, `/api` and `/ws` are proxied to `:8080` so the frontend can use relative URLs.
7. **SQLite driver** — uses `modernc.org/sqlite` (pure Go, no CGO needed).

---

## Build & Verify Commands

```bash
# Backend
cd backend && go build ./...

# Simulator
cd simulator && go build ./...

# Frontend type-check
cd frontend && npx tsc --noEmit

# Frontend production build
cd frontend && npm run build
```

---

## Common Tasks for Agents

### Adding a new REST endpoint
1. Add the handler method on the appropriate handler struct in `backend/handlers/`.
2. Register the route in `backend/main.go` inside the `api` group.
3. Add the typed fetch wrapper in `frontend/src/api/client.ts`.
4. If the endpoint surfaces new data, add state + setter to `useStore.ts`.

### Adding a new database table
1. Add the `CREATE TABLE` statement to `backend/db/schema.sql`.
2. The schema is auto-applied on startup (idempotent `IF NOT EXISTS`).
3. Optionally add seed data in `db.go`'s `seedIfEmpty()`.

### Adding a new frontend page
1. Create the page component in `frontend/src/pages/`.
2. Add a `<Route>` in `App.tsx`.
3. Add a nav item in `components/BottomNav.tsx`.

### Adding a new WebSocket message type
1. Define the struct in `backend/handlers/ws.go`.
2. Handle it in `handleDeviceMessage()` (device→backend) or broadcast via `BroadcastToCaregivers()`.
3. Add a case in `frontend/src/hooks/useWebSocket.ts`'s `onmessage` switch.
4. Update the Zustand store as needed.

### Modifying the schedule system
1. Update `backend/db/schema.sql` if schema changes.
2. Update `backend/handlers/schedule.go` for CRUD changes.
3. If the schedule format changes, update `scheduler/scheduler.go`'s `toCronExpr()`.
4. Remember: creating/deleting schedules auto-reloads the cron engine via the `OnChange` callback.
