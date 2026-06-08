# SebaKit — Smart Medication Reminder & Room Monitoring System

SebaKit is a fully-functional, real-time IoT healthcare system. It monitors a patient's room environment, alerts them at scheduled times to take their medication, and automatically sends a WhatsApp message to their guardian/caregiver if a dose is missed.

The system is built on **Supabase** (as the database, authentication, and realtime backend), a **React (TypeScript & Vite)** web application for caregivers, and an **ESP32-C3 Super Mini** IoT hardware device.

---

## 🚀 Key Features

* **📅 Smart Medication Scheduling**: Caregivers schedule recurring daily doses. The database automatically compiles schedule instances for the day.
* **🔊 Hardware Alarms & Box Sensor**: The ESP32-C3 rings a buzzer and flashes an LED at dose times. A magnetic contact sensor checks if the pill-box is physically opened to confirm ingestion.
* **💬 Twilio WhatsApp Alerts**: If a medication window is missed, the ESP32 performs a secure HTTPS POST request to the **Twilio Messages API** to send a WhatsApp notification to the guardian's phone number, warning them of the missed dose.
* **🍃 Live Room Monitoring**: Continuous ambient monitoring of Temperature & Humidity (**GY-BME280**). Sensor readings are posted to Supabase every 30s.
* **⚡ Real-time Telemetry Dashboard**: The React caregiver dashboard subscribes to Supabase Realtime. Ambient room parameters, alarm status, and logs are updated instantly without reloading.

---

## 📐 System Architecture

```
                 ┌────────────────────────────────┐
                 │                                │
                 │      React Web Application     │
                 │      (Caregiver Dashboard)     │
                 │                                │
                 └──────────────▲───┬─────────────┘
                                │   │
              Supabase Realtime │   │ Supabase JS Client
              INSERT / UPDATE   │   │ (REST CRUD)
                                │   ▼
                 ┌────────────────────────────────┐
                 │                                │
                 │            Supabase            │
                 │     (PostgreSQL Database)      │
                 │                                │
                 └──────────────▲───┬─────────────┘
                                │   │
               HTTPS JSON POST  │   │ HTTPS JSON GET
                 Sensor Data    │   │ Sync Schedules/Settings
                                │   ▼
┌────────────────┐      ┌───────┴────────────────┐
│   Twilio API   │      │                        │
│   (WhatsApp    │ ◄────┼───   ESP32-C3 Device   │
│   Messages)    │ HTTPS│    (Smart Pill-Box)    │
└────────────────┘      └────────────────────────┘
```

---

## 📂 Repository Structure

* **`esp32_c3/`**: Arduino firmware for the ESP32-C3 Super Mini microcontroller. Integrates BME280, SSD1306 OLED, Wi-Fi Manager, local non-volatile storage (Preferences) for offline queueing, and direct Twilio WhatsApp HTTPS messaging.
* **`frontend-supabase/`**: React, Vite, Tailwind CSS, TypeScript, and Zustand dashboard client communicating directly with Supabase.
* **`supabase-sql/`**: SQL migration scripts for database configuration.
  * `001_complete_setup.sql`: Core schema, custom ENUMs, triggers, and daily medication instance generation logic.
  * `002_room_monitoring_and_twilio.sql`: Room Monitoring table, air quality calculation function/trigger, and Twilio configuration columns.

---

## ⚡ Quick Start

### 1. Run the Web Application
```bash
# Navigate to web project
cd frontend-supabase

# Install dependencies
npm install

# Run the development server
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser. Ensure your `.env` file contains your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### 2. Setup the Database
* Create a new Supabase project.
* In the **SQL Editor**, run the scripts in order:
  1. [001_complete_setup.sql](file:///c:/Users/Administrator/Downloads/sebaKit-supabase/sebaKit-supabase/supabase-sql/001_complete_setup.sql)
  2. [002_room_monitoring_and_twilio.sql](file:///c:/Users/Administrator/Downloads/sebaKit-supabase/sebaKit-supabase/supabase-sql/002_room_monitoring_and_twilio.sql)

### 3. Flash the ESP32 Hardware
* Open `esp32_c3/sebakit_firmware.ino` in Arduino IDE.
* Configure your Supabase project credentials and Twilio WhatsApp parameters.
* Select the **ESP32C3 Dev Module** board and target COM port.
* Click **Upload**.
* Refer to [UPGRADE_SETUP_GUIDE.md](file:///c:/Users/Administrator/Downloads/sebaKit-supabase/sebaKit-supabase/UPGRADE_SETUP_GUIDE.md) for full physical wiring and installation instructions.
