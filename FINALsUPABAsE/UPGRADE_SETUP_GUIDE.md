# SebaKit — Room Monitoring & Medicine Missed WhatsApp Upgrade Guide

This guide details the step-by-step setup process for the new **SebaKit Room Monitoring & Medicine Missed WhatsApp** features.

---

## 📋 Overview of the Upgrade
1. **Room Monitoring**: Ambient sensor integration using the **GY-BME280** temperature/humidity sensor. Readings are recorded every 30 seconds and displayed live on the web app. Note: The legacy CCS811 air quality sensor has been removed for simplicity and lower power consumption.
2. **Medicine Missed WhatsApp Alert**: Automatic WhatsApp alerts via **Twilio**. If a patient misses a scheduled medication dose and fails to open the box within the configurable duration, the ESP32-C3 firmware triggers a WhatsApp message directly to the caregiver/guardian.

---

## 🛠️ Hardware Requirements & Wiring

### 1. Components List
* **ESP32-C3 Super Mini** microcontroller
* **GY-BME280** Temperature & Humidity Sensor
* **SSD1306 OLED Display** (128x64 pixels, I2C version)
* **Buzzer** (Active, 2-pin)
* **LED** (Status Indicator) + **220Ω resistor**
* **Metal contact/magnetic switch sensor** (for box open/close detection)

### 2. Circuit Connection Table
All I2C devices (OLED and BME280) share the same I2C bus pins.

| Component | Component Pin | ESP32-C3 GPIO / Connection | Notes |
|:---|:---|:---|:---|
| **OLED SSD1306** | VCC <br> GND <br> SDA <br> SCL | **3V3** <br> **GND** <br> **GPIO 8** <br> **GPIO 9** | Shared I2C bus (I2C address: `0x3C`) |
| **GY-BME280** | VCC <br> GND <br> SDA <br> SCL | **3V3** <br> **GND** <br> **GPIO 8** <br> **GPIO 9** | Shared I2C bus (I2C address: `0x76`) |
| **Buzzer** | Pin (+) <br> Pin (-) | **GPIO 1** <br> **GND** | Active buzzer for alert tones |
| **LED** | Pin (+) <br> Pin (-) | **GPIO 3** (via 220Ω resistor) <br> **GND** | Status indicator LED |
| **Metal Sensor** | Signal <br> GND | **GPIO 2** <br> **GND** | Configured as `INPUT_PULLUP`. Box open = `HIGH`, Box closed = `LOW` |

---

## 🗄️ Step 1: Supabase Database Migration

Execute the database updates to support room data and Twilio configuration.

1. Open your **Supabase Project Dashboard**.
2. Navigate to the **SQL Editor** in the left-hand menu.
3. Open/paste the contents of [002_room_monitoring_and_twilio.sql](file:///c:/Users/Administrator/Downloads/sebaKit-supabase/sebaKit-supabase/supabase-sql/002_room_monitoring_and_twilio.sql) into the SQL editor window.
4. Click **Run**.
5. **Verify the installation:**
   * Go to the **Table Editor** and verify that the `room_monitoring` table has been created.
   * Go to the `device_settings` table and confirm that the columns `guardian_phone` and `twilio_call_enabled` have been successfully appended.
   * Go to **Database → Replication** and verify that `room_monitoring` is added to the `supabase_realtime` publication (this ensures live telemetry updates reach your browser).

---

## 💬 Step 2: Twilio Developer Setup (WhatsApp Sandbox)

Since standard Twilio SMS/voice calls may have restrictions in some regions (such as Bangladesh), SebaKit uses Twilio WhatsApp Messaging.

1. Sign up/Log in to your [Twilio Console](https://www.twilio.com).
2. Obtain your **Account SID** and **Auth Token** from your dashboard.
3. Set up the **Twilio Sandbox for WhatsApp**:
   * Navigate to **Messaging → Try it out → Send a WhatsApp message** in the Twilio Console.
   * Note the Twilio Sandbox WhatsApp number (usually `+14155238886` or another number listed) and the join phrase (e.g., `join direction-member`).
4. **Register the Guardian Phone Number**:
   * The guardian/caregiver's phone (e.g., `+8801752863152`) **must join the sandbox** first.
   * Send the join phrase message from the guardian's WhatsApp account to the Twilio Sandbox WhatsApp number.
5. Open the firmware source code: [sebakit_firmware.ino](file:///c:/Users/Administrator/Downloads/sebaKit-supabase/sebaKit-supabase/esp32_c3/sebakit_firmware.ino).
6. Locate the **TWILIO CONFIG** block and insert your credentials:
   ```cpp
   // esp32_c3/sebakit_firmware.ino
   const char *TWILIO_ACCOUNT_SID = "ACb335e3527d42d41480181997d8dbe8d4";
   const char *TWILIO_AUTH_TOKEN  = "f25143f8826cd806e2f9ffa4d6093b7a";
   const char *TWILIO_FROM_NUMBER  = "+14783127158";          // Twilio Sandbox number without 'whatsapp:' prefix
   const char *DEFAULT_GUARDIAN    = "+8801752863152";        // Caregiver/Guardian number (with country code)
   ```

---

## 🔌 Step 3: Flash ESP32 Firmware

### 1. Arduino IDE Setup
1. Open the **Arduino IDE**.
2. Go to **File → Preferences**.
3. Under **Additional Boards Manager URLs**, ensure the ESP32 URL is present:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
4. Go to **Tools → Board → Boards Manager**, search for `esp32` by Espressif, and install/upgrade it.

### 2. Install Required Libraries
Navigate to **Sketch → Include Library → Manage Libraries...** and install:
* **Adafruit BME280 Library** (Temperature/Humidity Library)
* **Adafruit Unified Sensor** (Unified Sensor driver dependency)
* **Adafruit SSD1306** & **Adafruit GFX Library** (for the OLED display)
* **ArduinoJson** (Version 6.x or newer, for JSON payload formatting)
* **WiFiManager** (by tzapu, for captive portal Wi-Fi configuration)
* **NTPClient** (by Fabrice Weinberg, for synchronizing UTC time)

*Note: The `Adafruit CCS811` library is no longer required and does not need to be installed.*

### 3. Build & Flash
1. Connect your ESP32-C3 Super Mini to your computer via USB.
2. Select the board: **Tools → Board → esp32 → ESP32C3 Dev Module** (or your matching board model).
3. Select the correct **COM Port**.
4. Open the firmware file: [sebakit_firmware.ino](file:///c:/Users/Administrator/Downloads/sebaKit-supabase/sebaKit-supabase/esp32_c3/sebakit_firmware.ino).
5. Verify the `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct:
   ```cpp
   const char *SUPABASE_URL      = "https://YOUR_PROJECT.supabase.co";
   const char *SUPABASE_ANON_KEY = "YOUR_ANON_KEY";
   ```
6. Click **Upload** (Arrow icon).

### 4. Connect to Wi-Fi (First Boot)
1. On power-up, the OLED will show **"SebaKit Setup / Connect WiFi"**.
2. Using a smartphone or laptop, scan for Wi-Fi networks and connect to:
   * **SSID**: `SebaKit_Setup`
   * **Password**: `12345678`
3. A captive portal page should open automatically. If not, open your web browser and go to `192.168.4.1`.
4. Click **Configure WiFi**, select your home network, enter the password, and click **Save**.
5. The ESP32 will reboot and connect to your local network.

---

## 💻 Step 4: Web Application Setup & Run

The web application contains the updated Live Room Monitor card on the main dashboard and the new settings options.

### 1. Install Dependencies
Navigate to the frontend-supabase directory:
```bash
cd frontend-supabase
npm install
```

### 2. Environment Variables Configuration
Ensure your `.env` file at `frontend-supabase/.env` is configured with your Supabase credentials:
```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

### 3. Run Locally (Development Mode)
```bash
npm run dev
```
Open **http://localhost:5173** in your web browser.

### 4. Build for Production
To build the application bundle:
```bash
npm run build
```

---

## 🧪 Step 5: Verification & Testing

Verify that your upgraded system is working properly:

### 1. Verify Room Monitoring (Live Telemetry)
* Turn on the ESP32. Check the Arduino Serial Monitor (baud rate `115200`).
* You should see log lines like:
  ```text
  [SENSOR] BME280: 27.5°C, 62.4%
  [API] Posting sensor data... Response code: 201
  ```
* Open the Web App Dashboard. You will see a beautiful glassmorphism **Room Monitor** card showing the live Temperature & Humidity readings.

### 2. Verify Settings Panel
* Go to the **Settings** page in the web app.
* Enter a guardian phone number in the **Guardian Phone Number** field (in E.164 international format, e.g., `+8801752863152`).
* Toggle the **Enable Guardian Twilio Call** setting (which functions as the general WhatsApp alert toggle) and click **Save**.

### 3. Verify Twilio WhatsApp Alert
* Create a scheduled medicine reminder in the web app. Note that the system will automatically generate today's medicine instance upon schedule creation!
* Let the alarm trigger on the ESP32 (OLED flashes and buzzer sounds).
* **Do NOT open the box** (leave the contact sensor connected representing "closed").
* Wait for the alarm duration (default `1` minute or as configured in `alert_duration_min`).
* The alarm should timeout, the status will set to **missed**, and the ESP32 will perform an HTTPS request to Twilio.
* You should receive a WhatsApp message on the guardian's phone:
  `🚨 *SebaKit Alert* ... The patient has *missed* their *[Medicine Name]* dose ...`
