# SebaKit — Developer Reference Manual & Onboarding Guide

Welcome to the **SebaKit** developer guide. This document serves as a comprehensive onboarding reference detailing the technical architecture, data model, realtime event flow, and firmware states of the Supabase & ESP32-C3 upgraded system.

---

## 🛠️ Tech Stack & Dependencies

| Layer | Technology | Key Libraries & SDKs |
| :--- | :--- | :--- |
| **Microcontroller Hardware** | ESP32-C3 (Super Mini) | Arduino IDE Framework, `Adafruit BME280`, `Adafruit SSD1306`, `WiFiManager`, `ArduinoJson`, `NTPClient` |
| **Database & Backend** | Supabase (Managed PostgreSQL) | PostgreSQL 15, PostgREST (Auto-REST API), Supabase Realtime Engine, PL/pgSQL functions |
| **Caregiver Dashboard** | React 19, TypeScript 6, Vite 8 | `@supabase/supabase-js`, `zustand` (State Management), `react-router-dom` (Routing), `tailwindcss` (Styling) |
| **Communication / Alerts** | Twilio Messages API (WhatsApp) | Direct HTTPS REST requests via ESP32 `WiFiClientSecure` |

---

## 🗄️ Database Schema & Database Logic

The backend runs entirely on Supabase. The database structure is defined in two schema files under `supabase-sql/`.

### 1. Database Tables & Custom Types
* **Custom Types**:
  * `medicine_status` ENUM: `'pending'`, `'taken'`, `'missed'`
  * `event_type` ENUM: `'created'`, `'taken'`, `'missed'`, `'skipped'`
* **`medications`**: The master catalog of scheduled items.
  * `id` (UUID, PK), `device_id` (TEXT), `name` (TEXT), `dose` (TEXT), `notes` (TEXT), `created_at` / `updated_at`.
* **`schedules`**: Recurring rule definitions for medication doses.
  * `id` (UUID, PK), `medication_id` (UUID, FK), `device_id` (TEXT), `time_of_day` (TIME), `days_of_week` (TEXT, e.g., `'1,2,3,4,5,6,7'`), `start_date` (DATE), `end_date` (DATE), `active` (BOOLEAN).
* **`medicines`**: Daily concrete instances generated from `schedules`. The ESP32 device queries this table to know when to sound alarms.
  * `id` (UUID, PK), `medication_id` (UUID, FK), `schedule_id` (UUID, FK), `device_id` (TEXT), `name` (TEXT), `dose` (TEXT), `time` (TIME), `date` (DATE), `status` (`medicine_status`), `taken_at` (TIMESTAMPTZ).
* **`device_settings`**: Global configuration parameters for the pill-box device.
  * `id` (UUID, PK), `device_id` (TEXT, Unique), `patient_name` (TEXT), `patient_type` (TEXT), `alert_duration_min` (INTEGER), `timezone` (TEXT), `guardian_phone` (TEXT), `twilio_call_enabled` (BOOLEAN).
* **`room_monitoring`**: Live sensor telemetry logs uploaded by the device.
  * `id` (UUID, PK), `device_id` (TEXT), `temperature` (REAL), `humidity` (REAL), `created_at` (TIMESTAMPTZ).
  * *Note: The columns `eco2` and `tvoc` exist in the legacy database schema but are no longer active, as the CCS811 sensor has been deprecated.*
* **`events_log`**: Audit trail of statuses for history reports.
  * `id` (UUID, PK), `medicine_id` (UUID, FK), `device_id` (TEXT), `event_type` (`event_type`), `details` (JSONB), `created_at` (TIMESTAMPTZ).

### 2. Triggers & Custom Functions
* **Auto-Log Status Changes**: The trigger `on_medicine_status_change` runs the function `log_medicine_status_change()` before any update on `medicines`. It logs transition audits into `events_log` and sets `taken_at` automatically if status becomes `'taken'`.
* **Generate Daily Medicine Instances**: `generate_daily_medicines(target_date DATE, target_device TEXT)` generates all `medicines` rows for a particular date by matching active `schedules` and their `days_of_week` array. It is triggered automatically when creating a new schedule or loading the web app.
* **Telemetry Cleanup**: `cleanup_old_room_data()` deletes entries in `room_monitoring` older than 24 hours to keep the database size optimized.

---

## ⚡ Web App Frontend Architecture

The frontend is located under `frontend-supabase/` and communicates directly with your Supabase database.

### 1. State Management (Zustand)
`frontend-supabase/src/store/useStore.ts` holds all state:
```typescript
interface AppState {
  medications: Medication[];
  schedules: Schedule[];
  todayMedicines: Medicine[];
  deviceSettings: DeviceSettings | null;
  roomData: RoomMonitoring | null;       // Live sensor telemetry (Temperature & Humidity only)
  loading: boolean;
  // actions...
}
```

### 2. Supabase Realtime Subscription Hook
`frontend-supabase/src/hooks/useSupabaseRealtime.ts` runs on app load. It sets up two primary event listeners:
1. **`medicines` updates**: Re-fetches today's medicines if the device marks a dose as `taken` or `missed`.
2. **`room_monitoring` inserts**: Automatically pushes new ambient sensor records into the store state, triggering immediate UI state updates inside the `<RoomMonitor />` card on the dashboard.

### 3. Page Routing Layout
* `/` (**Dashboard**): Main landing page. Features general patient stats, a 2x2 grid live **Room Monitor** telemetry card (displaying current temperature & humidity), and today's schedule checklist.
* `/schedule` (**Schedule**): Form to create new medications and manage schedules. Creating schedules automatically triggers today's medicine generation.
* `/history` (**History**): Displays historical logs from `events_log`.
* `/settings` (**Settings**): Configures timezone, patient details, alarm duration, guardian phone numbers, and Twilio WhatsApp alerts.

---

## 🔌 ESP32-C3 Firmware State Machine

The firmware (`esp32_c3/sebakit_firmware.ino`) uses an event-driven, cooperative non-blocking loop built around a state machine:

```
                  ┌───────────────┐
                  │  WIFI_SETUP   │ ◄─── Captive Portal Active
                  └───────┬───────┘
                          │ Connected
                          ▼
                  ┌───────────────┐
                  │     IDLE      │ ◄─── Polls settings & medicines
                  └───────┬───────┘      Updates sensors & POSTs data
                          │
            Time Matches  │  Dose Opened
            Pending Dose  │  Within Window
                          ▼
                  ┌───────────────┐
                  │     ALERT     ├──────────────┐
                  └───────┬───────┘              │
                          │                      │ Open Duration
            Box Opened    │                      │ Timeout Expired
            (Ingested)    ▼                      ▼
                  ┌───────────────┐      ┌───────────────┐
                  │     TAKEN     │      │    MISSED     │
                  └───────┬───────┘      └───────┬───────┘
                          │                      │
                          │   Returns to Idle    │   Twilio WhatsApp Message
                          ▼   After 1.5 Seconds  │   HTTPS POST Triggered
                  ┌───────────────┐              ▼
                  │     IDLE      │      ┌───────────────┐
                  └───────────────┘      │     IDLE      │
                                         └───────────────┘
```

### 1. Key States
* **`STATE_WIFI_SETUP`**: Initiated if no WiFi credentials exist or auto-connection fails. Starts the captive portal SSID: `SebaKit_Setup` (Pass: `12345678`).
* **`STATE_IDLE`**: The baseline operating state. Every 30 seconds, it reads the BME280 sensor, logs values to the SSD1306 OLED, and POSTs them to the Supabase REST API. It also polls scheduled medicines.
* **`STATE_ALERT`**: Triggered when the current device time matches a pending medication's time. Buzzes the hardware and flashes the LED.
* **`STATE_TAKEN`**: Triggered if the metal switch is opened during an alert. Sounds success tones and updates status to `taken` on Supabase.
* **`STATE_MISSED`**: Triggered if the alert duration (e.g. 3 minutes) expires without the patient opening the box. Updates the dose status to `missed` and initiates the Twilio WhatsApp alert.
* **`STATE_OFFLINE`**: Safe fallback if Wi-Fi drops.

### 2. Twilio WhatsApp Message Trigger
When a missed dose event is determined:
1. The device checks if `twilio_call_enabled` is true and `guardian_phone` has a valid number.
2. It generates a WhatsApp message body:
   `"🚨 *SebaKit Alert*\n\nThe patient has *missed* their *[Medicine Name]* dose scheduled at *[Time]*.\n\nPlease check on them immediately."`
3. It performs a secure HTTPS POST to the Twilio Messages API Endpoint `/Accounts/[Account_SID]/Messages.json` with the parameters `To`, `From`, and `Body`.
4. Authentication uses HTTP Basic Auth header (`Authorization: Basic BASE64(SID:TOKEN)`).

### 3. Offline Resiliency (Preferences Queue)
If the device status update fails (e.g., local Wi-Fi drops), the firmware saves the pending update (e.g., `id:taken` or `id:missed`) to the ESP32's non-volatile flash storage using the `Preferences` library. On the next successful loop connection, `retryPendingUpdates()` reads this queue and PATCHes the records to Supabase.

---

## 🛠️ Verification & Build Commands

Before pushing any codebase changes, verify both type-correctness and build results.

```bash
# 1. Type-check frontend project
cd frontend-supabase
npx tsc --noEmit

# 2. Build production assets
npm run build
```

---

## 📝 Common Development Tasks

### 1. Adjusting Sensor Parameters
* BME280 reads temperature & humidity on the shared I2C bus.
* Read values and modify `readAndPostSensors()` to append parameters to the JSON payload.
* Modify the layout inside `frontend-supabase/src/components/RoomMonitor.tsx` to customize display cards.

### 2. Adjusting RLS Security Policies
* All policies are defined in `supabase-sql/001_complete_setup.sql` and `002_room_monitoring_and_twilio.sql`.
* If adding user authentication later, replace the `"Allow anon full access"` policies with authenticated checks:
  ```sql
  CREATE POLICY "Allow authenticated read" ON medications
    FOR SELECT TO authenticated USING (true);
  ```
