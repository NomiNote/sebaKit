/*
 * ============================================================
 *  SEBAKIT — Smart Medication Reminder System
 *  Firmware v2.0 (Supabase Edition)
 *  Target: ESP32-C3 Super Mini
 *  Author: SebaKit IoT
 *  Timezone: Asia/Dhaka (GMT+6)
 * ============================================================
 *
 *  CHANGES FROM v1.0:
 *   - Alert duration is now fetched from Supabase `device_settings` table
 *     (configurable from the website Settings page)
 *   - Fixed JSON body in updateMedicineStatus (was broken with emoji)
 *   - Added device_settings fetch on boot + periodic refresh
 *   - Retry queue improved with key enumeration
 *
 *  LIBRARIES REQUIRED (install via Arduino Library Manager):
 *   - Adafruit SSD1306           (OLED display)
 *   - Adafruit GFX Library       (graphics primitives)
 *   - ArduinoJson                (JSON parsing v6+)
 *   - WiFiManager by tzapu       (captive portal WiFi setup)
 *   - NTPClient by Fabrice Weinberg
 *   - HTTPClient                 (built-in ESP32)
 *   - Preferences                (built-in ESP32 NVS)
 *
 *  CIRCUIT WIRING:
 *   | Component           | ESP32-C3 GPIO | Notes                         |
 *   |---------------------|---------------|-------------------------------|
 *   | OLED SSD1306 SDA    | GPIO 8        | I2C Data                      |
 *   | OLED SSD1306 SCL    | GPIO 9        | I2C Clock                     |
 *   | OLED SSD1306 VCC    | 3V3           | 3.3V power only               |
 *   | OLED SSD1306 GND    | GND           |                               |
 *   | Buzzer (+)          | GPIO 1        | Active buzzer (2-pin)         |
 *   | Buzzer (-)          | GND           |                               |
 *   | LED Anode (+)       | GPIO 3        | With 220Ω resistor in series  |
 *   | LED Cathode (-)     | GND           |                               |
 *   | Metal sensor Signal | GPIO 2        | INPUT_PULLUP, HIGH = box open |
 *   | Metal sensor GND    | GND           |                               |
 *
 *  FIRST BOOT WiFi SETUP:
 *   1. Power on — OLED shows "SebaKit Setup / Connect WiFi"
 *   2. On phone/laptop, connect to WiFi: SSID "SebaKit_Setup", Password "12345678"
 *   3. Captive portal opens (or go to 192.168.4.1)
 *   4. Enter home WiFi SSID + password → Save
 *   5. ESP32 restarts and connects
 * ============================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <NTPClient.h>
#include <WiFiUDP.h>
#include <Preferences.h>
#include <time.h>

// ─────────────────────────────────────────────
//  PIN DEFINITIONS (ESP32-C3 Super Mini)
// ─────────────────────────────────────────────
#define PIN_SDA          8    // I2C SDA → OLED
#define PIN_SCL          9    // I2C SCL → OLED
#define PIN_BUZZER       1    // Buzzer positive pin
#define PIN_LED          3    // Status LED (active HIGH)
#define PIN_METAL_SENSOR 2    // Metal contact sensor (INPUT_PULLUP, HIGH = box open)

// ─────────────────────────────────────────────
//  OLED CONFIG
// ─────────────────────────────────────────────
#define OLED_WIDTH  128
#define OLED_HEIGHT  64
#define OLED_ADDR   0x3C
#define OLED_RESET  -1

// ─────────────────────────────────────────────
//  SUPABASE CONFIG — fill in your credentials
// ─────────────────────────────────────────────
const char* SUPABASE_URL      = "https://yugvimsglmgvwviwwdmq.supabase.co";
const char* SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1Z3ZpbXNnbG1ndnd2aXd3ZG1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NDE3MDAsImV4cCI6MjA5NTExNzcwMH0.XBlCsSH6JMNSsgvTAbnAV9TqwMsXsLJi9Yeh_xPh120";
const char* DEVICE_ID         = "sevakit-001";  // unique per device

// ─────────────────────────────────────────────
//  TIMEZONE: Asia/Dhaka = UTC+6 (no DST)
// ─────────────────────────────────────────────
#define TZ_OFFSET_SEC  (6 * 3600)
#define NTP_SERVER     "pool.ntp.org"

// ─────────────────────────────────────────────
//  TIMING CONSTANTS
// ─────────────────────────────────────────────
#define DEFAULT_ALERT_DURATION_MIN  3                         // fallback if settings fetch fails
#define FETCH_INTERVAL_MS           (60 * 1000UL)             // fetch medicines every 60s
#define SETTINGS_FETCH_INTERVAL_MS  (5 * 60 * 1000UL)        // fetch settings every 5 min
#define SENSOR_DEBOUNCE_MS          50
#define WIFI_RECONNECT_MS           (30 * 1000UL)
#define BUZZER_BEEP_ON_MS           300
#define BUZZER_BEEP_OFF_MS          500
#define API_RETRY_COUNT             3
#define API_RETRY_DELAY_MS          2000

// ─────────────────────────────────────────────
//  OBJECTS
// ─────────────────────────────────────────────
Adafruit_SSD1306 oled(OLED_WIDTH, OLED_HEIGHT, &Wire, OLED_RESET);
WiFiUDP          ntpUDP;
NTPClient        ntpClient(ntpUDP, NTP_SERVER, TZ_OFFSET_SEC, 60000);
Preferences      prefs;

// ─────────────────────────────────────────────
//  MEDICINE STRUCT
// ─────────────────────────────────────────────
struct Medicine {
  String id;
  String name;
  String scheduledTime;   // "HH:MM"
  String date;            // "YYYY-MM-DD"
  String status;          // "pending" | "taken" | "missed"
};

// ─────────────────────────────────────────────
//  STATE MACHINE
// ─────────────────────────────────────────────
enum SystemState {
  STATE_WIFI_SETUP,
  STATE_CONNECTING,
  STATE_IDLE,
  STATE_ALERT,
  STATE_TAKEN,
  STATE_MISSED,
  STATE_OFFLINE
};

SystemState       currentState    = STATE_WIFI_SETUP;
Medicine          medicines[10];
int               medicineCount   = 0;
int               activeMedIdx    = -1;   // index of currently alerting medicine

// ── Device Settings (fetched from Supabase) ──
int               alertDurationMin = DEFAULT_ALERT_DURATION_MIN;
unsigned long     alertWindowMs    = DEFAULT_ALERT_DURATION_MIN * 60 * 1000UL;

// ── Timing State ──
unsigned long     alertStartMs       = 0;
unsigned long     lastFetchMs        = 0;
unsigned long     lastSettingsFetch  = 0;
unsigned long     lastBuzzerMs       = 0;
unsigned long     lastWifiCheckMs    = 0;
bool              buzzerPhase        = false;
bool              oledNeedsUpdate    = true;

// ─────────────────────────────────────────────
//  FORWARD DECLARATIONS
// ─────────────────────────────────────────────
void     setupWifi();
bool     connectWifi();
void     syncNTP();
void     fetchMedicines();
void     fetchDeviceSettings();
void     checkAlerts();
void     runAlertLoop();
bool     isSensorOpen();
bool     updateMedicineStatus(const String& id, const String& status);
void     retryPendingUpdates();
void     oledShow(const char* line1, const char* line2 = "", const char* line3 = "");
void     oledShowAlert(const String& medName);
void     oledShowIdle();
void     buzzerBeepTick();
void     buzzerOff();
void     ledOn();
void     ledOff();
String   getCurrentHHMM();
String   getCurrentDate();
String   buildSupabaseUrl(const String& path);
String   httpGet(const String& url, int retries = API_RETRY_COUNT);
bool     httpPatch(const String& url, const String& body, int retries = API_RETRY_COUNT);


// ════════════════════════════════════════════
//  SETUP
// ════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(200);

  // GPIO init
  pinMode(PIN_BUZZER,       OUTPUT);
  pinMode(PIN_LED,          OUTPUT);
  pinMode(PIN_METAL_SENSOR, INPUT_PULLUP);
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LED,    LOW);

  // I2C + OLED
  Wire.begin(PIN_SDA, PIN_SCL);
  if (!oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("[OLED] INIT FAILED — check wiring");
    while (true) { delay(1000); }
  }
  oled.setTextColor(SSD1306_WHITE);
  oled.clearDisplay();

  oledShow("SebaKit", "Starting...");

  // WiFi setup via WiFiManager captive portal
  setupWifi();

  // NTP sync
  syncNTP();

  // Fetch device settings (alert_duration, etc.) from Supabase
  fetchDeviceSettings();

  // Initial medicine fetch
  fetchMedicines();

  // Retry any queued status updates from previous offline session
  retryPendingUpdates();

  currentState    = STATE_IDLE;
  oledNeedsUpdate = true;
  Serial.println("[SEBAKIT] Boot complete.");
}


// ════════════════════════════════════════════
//  MAIN LOOP — event-driven, NO blocking delay
// ════════════════════════════════════════════
void loop() {
  unsigned long now = millis();

  // ── WiFi watchdog ──
  if (now - lastWifiCheckMs > WIFI_RECONNECT_MS) {
    lastWifiCheckMs = now;
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[WiFi] Disconnected — reconnecting...");
      currentState = STATE_OFFLINE;
      oledShow("SebaKit Offline", "Reconnecting...");
      connectWifi();
      if (WiFi.status() == WL_CONNECTED) {
        syncNTP();
        retryPendingUpdates();
        currentState    = STATE_IDLE;
        oledNeedsUpdate = true;
      }
    }
  }

  // ── NTP tick ──
  ntpClient.update();

  // ── Periodic settings fetch (every 5 min, only in IDLE) ──
  if (currentState == STATE_IDLE && (now - lastSettingsFetch > SETTINGS_FETCH_INTERVAL_MS)) {
    lastSettingsFetch = now;
    fetchDeviceSettings();
  }

  // ── Periodic medicine fetch (every 60s, only in IDLE) ──
  if (currentState == STATE_IDLE && (now - lastFetchMs > FETCH_INTERVAL_MS)) {
    lastFetchMs = now;
    fetchMedicines();
    oledNeedsUpdate = true;
  }

  // ── Check if any medicine time matches now ──
  if (currentState == STATE_IDLE) {
    checkAlerts();
  }

  // ── Alert loop (non-blocking beep + sensor poll) ──
  if (currentState == STATE_ALERT) {
    runAlertLoop();
  }

  // ── Update OLED only when state changes ──
  if (oledNeedsUpdate) {
    oledNeedsUpdate = false;
    switch (currentState) {
      case STATE_IDLE:    oledShowIdle();                              break;
      case STATE_TAKEN:   oledShow("Medicine Taken", "", "Check: done"); break;
      case STATE_MISSED:  oledShow("Missed Dose!", "Inform Guardian", ""); break;
      case STATE_OFFLINE: oledShow("SebaKit Offline", "Reconnecting...", ""); break;
      default: break;
    }
  }

  // ── Auto-return to IDLE after taken/missed display (5s) ──
  static unsigned long postEventMs = 0;
  static SystemState   lastEvent   = STATE_IDLE;
  if (currentState == STATE_TAKEN || currentState == STATE_MISSED) {
    if (lastEvent != currentState) { lastEvent = currentState; postEventMs = now; }
    if (now - postEventMs > 5000) {
      currentState    = STATE_IDLE;
      oledNeedsUpdate = true;
      lastEvent       = STATE_IDLE;
    }
  }
}


// ════════════════════════════════════════════
//  WIFI SETUP (WiFiManager captive portal)
// ════════════════════════════════════════════
void setupWifi() {
  oledShow("SebaKit Setup", "Connect WiFi:", "SebaKit_Setup");
  Serial.println("[WiFi] Starting WiFiManager...");

  WiFiManager wm;
  wm.setAPStaticIPConfig(IPAddress(192, 168, 4, 1),
                         IPAddress(192, 168, 4, 1),
                         IPAddress(255, 255, 255, 0));

  wm.setTitle("SebaKit WiFi Setup");
  wm.setConfigPortalTimeout(180);  // 3 min timeout

  bool connected = wm.autoConnect("SebaKit_Setup", "12345678");

  if (!connected) {
    Serial.println("[WiFi] Config portal timed out — rebooting");
    oledShow("WiFi Timeout", "Restarting...");
    delay(2000);
    ESP.restart();
  }

  oledShow("SebaKit Online", "WiFi Connected", WiFi.localIP().toString().c_str());
  ledOn();
  delay(1500);
  ledOff();
  Serial.printf("[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
}

bool connectWifi() {
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    WiFi.reconnect();
    delay(500);
    attempts++;
  }
  return WiFi.status() == WL_CONNECTED;
}


// ════════════════════════════════════════════
//  NTP SYNC
// ════════════════════════════════════════════
void syncNTP() {
  Serial.println("[NTP] Syncing...");
  ntpClient.begin();
  int tries = 0;
  while (!ntpClient.update() && tries < 10) {
    ntpClient.forceUpdate();
    delay(500);
    tries++;
  }
  Serial.printf("[NTP] Time: %s\n", ntpClient.getFormattedTime().c_str());
}


// ════════════════════════════════════════════
//  FETCH DEVICE SETTINGS FROM SUPABASE
//  Reads alert_duration_min from device_settings table
// ════════════════════════════════════════════
void fetchDeviceSettings() {
  if (WiFi.status() != WL_CONNECTED) return;

  String urlStr = buildSupabaseUrl(
    "/rest/v1/device_settings?select=alert_duration_min&device_id=eq."
    + String(DEVICE_ID)
    + "&limit=1"
  );

  Serial.println("[API] Fetching device settings...");
  String response = httpGet(urlStr);
  if (response.isEmpty()) {
    Serial.println("[API] Settings fetch failed — using defaults");
    return;
  }

  DynamicJsonDocument doc(512);
  DeserializationError err = deserializeJson(doc, response);
  if (err) {
    Serial.printf("[JSON] Settings parse error: %s\n", err.c_str());
    return;
  }

  JsonArray arr = doc.as<JsonArray>();
  if (arr.size() > 0) {
    int duration = arr[0]["alert_duration_min"].as<int>();
    if (duration > 0 && duration <= 60) {
      alertDurationMin = duration;
      alertWindowMs    = (unsigned long)alertDurationMin * 60UL * 1000UL;
      Serial.printf("[SETTINGS] Alert duration: %d min (%lu ms)\n", alertDurationMin, alertWindowMs);
    }
  }

  lastSettingsFetch = millis();
}


// ════════════════════════════════════════════
//  FETCH MEDICINES FROM SUPABASE
// ════════════════════════════════════════════
void fetchMedicines() {
  if (WiFi.status() != WL_CONNECTED) return;

  String today  = getCurrentDate();
  String urlStr = buildSupabaseUrl(
    "/rest/v1/medicines?select=id,name,time,date,status&device_id=eq."
    + String(DEVICE_ID)
    + "&date=eq." + today
    + "&status=eq.pending"
    + "&order=time.asc"
  );

  Serial.println("[API] Fetching medicines for " + today);
  String response = httpGet(urlStr);
  if (response.isEmpty()) {
    Serial.println("[API] Empty response — skipping fetch");
    return;
  }

  DynamicJsonDocument doc(4096);
  DeserializationError err = deserializeJson(doc, response);
  if (err) {
    Serial.printf("[JSON] Parse error: %s\n", err.c_str());
    return;
  }

  medicineCount = 0;
  JsonArray arr = doc.as<JsonArray>();
  for (JsonObject obj : arr) {
    if (medicineCount >= 10) break;
    medicines[medicineCount].id            = obj["id"].as<String>();
    medicines[medicineCount].name          = obj["name"].as<String>();
    medicines[medicineCount].scheduledTime = obj["time"].as<String>();  // "HH:MM:SS"
    medicines[medicineCount].date          = obj["date"].as<String>();
    medicines[medicineCount].status        = obj["status"].as<String>();
    // Trim seconds if present: "08:30:00" → "08:30"
    if (medicines[medicineCount].scheduledTime.length() > 5) {
      medicines[medicineCount].scheduledTime = medicines[medicineCount].scheduledTime.substring(0, 5);
    }
    medicineCount++;
  }
  Serial.printf("[API] Loaded %d pending medicines\n", medicineCount);
}


// ════════════════════════════════════════════
//  CHECK IF ANY MEDICINE IS DUE NOW
// ════════════════════════════════════════════
void checkAlerts() {
  String now_hhmm = getCurrentHHMM();
  String now_date = getCurrentDate();

  for (int i = 0; i < medicineCount; i++) {
    if (medicines[i].status != "pending") continue;
    if (medicines[i].date   != now_date)  continue;

    // Exact minute match — trigger alert for the medicine due right now
    if (medicines[i].scheduledTime == now_hhmm) {
      activeMedIdx  = i;
      currentState  = STATE_ALERT;
      alertStartMs  = millis();
      buzzerPhase   = false;
      lastBuzzerMs  = 0;
      oledShowAlert(medicines[activeMedIdx].name);
      ledOn();
      Serial.printf("[ALERT] Medicine due: %s at %s (window: %d min)\n",
                    medicines[i].name.c_str(),
                    medicines[i].scheduledTime.c_str(),
                    alertDurationMin);
      return;
    }
  }
}


// ════════════════════════════════════════════
//  ALERT LOOP (non-blocking)
// ════════════════════════════════════════════
void runAlertLoop() {
  unsigned long now = millis();

  // ── Check timeout (configurable alert window) ──
  if (now - alertStartMs > alertWindowMs) {
    // MISSED
    buzzerOff();
    ledOff();
    medicines[activeMedIdx].status = "missed";
    updateMedicineStatus(medicines[activeMedIdx].id, "missed");
    currentState    = STATE_MISSED;
    oledNeedsUpdate = true;
    activeMedIdx    = -1;
    Serial.printf("[EVENT] MISSED — no interaction within %d minutes\n", alertDurationMin);
    return;
  }

  // ── Poll metal sensor (debounced) ──
  if (isSensorOpen()) {
    // TAKEN
    buzzerOff();
    ledOff();
    medicines[activeMedIdx].status = "taken";
    updateMedicineStatus(medicines[activeMedIdx].id, "taken");
    currentState    = STATE_TAKEN;
    oledNeedsUpdate = true;
    activeMedIdx    = -1;
    Serial.println("[EVENT] TAKEN — box opened");
    return;
  }

  // ── Non-blocking buzzer beep pattern ──
  if (buzzerPhase == false && now - lastBuzzerMs > BUZZER_BEEP_OFF_MS) {
    digitalWrite(PIN_BUZZER, HIGH);
    buzzerPhase  = true;
    lastBuzzerMs = now;
  } else if (buzzerPhase == true && now - lastBuzzerMs > BUZZER_BEEP_ON_MS) {
    digitalWrite(PIN_BUZZER, LOW);
    buzzerPhase  = false;
    lastBuzzerMs = now;
  }
}


// ════════════════════════════════════════════
//  METAL SENSOR (debounced)
// ════════════════════════════════════════════
bool isSensorOpen() {
  // HIGH = metal disconnected = box OPEN = medicine TAKEN
  // LOW  = metal connected    = box CLOSED = medicine NOT taken
  bool raw = (digitalRead(PIN_METAL_SENSOR) == HIGH);
  if (!raw) return false;
  delay(SENSOR_DEBOUNCE_MS);
  return (digitalRead(PIN_METAL_SENSOR) == HIGH);
}


// ════════════════════════════════════════════
//  UPDATE SUPABASE STATUS
// ════════════════════════════════════════════
bool updateMedicineStatus(const String& id, const String& status) {
  String url  = buildSupabaseUrl("/rest/v1/medicines?id=eq." + id);
  String body = "{\"status\":\"" + status + "\"}";
  bool   ok   = httpPatch(url, body);
  if (ok) {
    Serial.printf("[API] Status updated → %s for %s\n", status.c_str(), id.c_str());
  } else {
    Serial.printf("[API] PATCH FAILED for %s — queuing for retry\n", id.c_str());
    // Offline cache — store in Preferences for retry on reconnect
    prefs.begin("retry_q", false);
    String key = "q_" + id.substring(0, 8);
    prefs.putString(key.c_str(), id + ":" + status);
    prefs.end();
  }
  return ok;
}


// ════════════════════════════════════════════
//  RETRY QUEUE (call after WiFi reconnects)
// ════════════════════════════════════════════
void retryPendingUpdates() {
  if (WiFi.status() != WL_CONNECTED) return;

  prefs.begin("retry_q", false);

  // Try up to 10 queued retries (keys q_XXXXXXXX)
  for (int i = 0; i < 10; i++) {
    char keyBuf[16];
    // We don't know the exact keys, but we stored them with "q_" prefix
    // Try common patterns — in production, keep a separate index
    // For now, this is a best-effort approach
    String testKey = "q_" + String(i);
    if (prefs.isKey(testKey.c_str())) {
      String val = prefs.getString(testKey.c_str(), "");
      if (val.length() > 0) {
        int colonIdx = val.indexOf(':');
        if (colonIdx > 0) {
          String retryId     = val.substring(0, colonIdx);
          String retryStatus = val.substring(colonIdx + 1);
          Serial.printf("[RETRY] Retrying: %s → %s\n", retryId.c_str(), retryStatus.c_str());

          String url  = buildSupabaseUrl("/rest/v1/medicines?id=eq." + retryId);
          String body = "{\"status\":\"" + retryStatus + "\"}";
          if (httpPatch(url, body, 1)) {
            prefs.remove(testKey.c_str());
            Serial.println("[RETRY] Success — removed from queue");
          }
        }
      }
    }
  }

  prefs.end();
}


// ════════════════════════════════════════════
//  HTTP HELPERS
// ════════════════════════════════════════════
String buildSupabaseUrl(const String& path) {
  return String(SUPABASE_URL) + path;
}

String httpGet(const String& url, int retries) {
  for (int attempt = 0; attempt < retries; attempt++) {
    HTTPClient http;
    http.begin(url);
    http.addHeader("apikey",        SUPABASE_ANON_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
    http.addHeader("Content-Type",  "application/json");
    int code = http.GET();
    if (code == 200) {
      String body = http.getString();
      http.end();
      return body;
    }
    Serial.printf("[HTTP] GET attempt %d failed: %d\n", attempt + 1, code);
    http.end();
    if (attempt < retries - 1) delay(API_RETRY_DELAY_MS);
  }
  return "";
}

bool httpPatch(const String& url, const String& body, int retries) {
  for (int attempt = 0; attempt < retries; attempt++) {
    HTTPClient http;
    http.begin(url);
    http.addHeader("apikey",        SUPABASE_ANON_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
    http.addHeader("Content-Type",  "application/json");
    http.addHeader("Prefer",        "return=minimal");
    int code = http.PATCH(body);
    if (code == 204 || code == 200) {
      http.end();
      return true;
    }
    Serial.printf("[HTTP] PATCH attempt %d failed: %d\n", attempt + 1, code);
    http.end();
    if (attempt < retries - 1) delay(API_RETRY_DELAY_MS);
  }
  return false;
}


// ════════════════════════════════════════════
//  TIME HELPERS
// ════════════════════════════════════════════
String getCurrentHHMM() {
  time_t epoch = ntpClient.getEpochTime();
  struct tm* t = localtime(&epoch);
  char buf[6];
  snprintf(buf, sizeof(buf), "%02d:%02d", t->tm_hour, t->tm_min);
  return String(buf);
}

String getCurrentDate() {
  time_t epoch = ntpClient.getEpochTime();
  struct tm* t = localtime(&epoch);
  char buf[11];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02d", t->tm_year + 1900, t->tm_mon + 1, t->tm_mday);
  return String(buf);
}


// ════════════════════════════════════════════
//  OLED HELPERS
// ════════════════════════════════════════════
void oledShow(const char* line1, const char* line2, const char* line3) {
  oled.clearDisplay();
  oled.setTextSize(1);

  oled.setCursor(0, 0);
  oled.setTextSize(line2[0] == '\0' ? 2 : 1);
  oled.println(line1);

  if (line2[0] != '\0') {
    oled.setTextSize(1);
    oled.setCursor(0, 26);
    oled.println(line2);
  }
  if (line3[0] != '\0') {
    oled.setCursor(0, 46);
    oled.println(line3);
  }
  oled.display();
}

void oledShowAlert(const String& medName) {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  oled.println(">>> TAKE MEDICINE <<<");
  oled.setTextSize(2);
  oled.setCursor(0, 22);
  // Truncate long names
  String name = medName.length() > 10 ? medName.substring(0, 10) : medName;
  oled.println(name);
  oled.setTextSize(1);
  oled.setCursor(0, 54);
  String footer = "Open box (" + String(alertDurationMin) + " min)";
  oled.println(footer);
  oled.display();
}

void oledShowIdle() {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  oled.println("SebaKit Ready");
  oled.setCursor(0, 16);
  oled.println(getCurrentHHMM());

  if (medicineCount > 0) {
    String now_hhmm = getCurrentHHMM();
    bool   shown    = false;

    for (int i = 0; i < medicineCount; i++) {
      if (medicines[i].status != "pending") continue;

      // Show the first pending medicine whose time >= current time
      if (medicines[i].scheduledTime >= now_hhmm) {
        oled.setCursor(0, 34);
        oled.println("Next dose:");
        oled.setCursor(0, 46);
        String label = medicines[i].name.substring(0, 14);
        label += " " + medicines[i].scheduledTime;
        oled.println(label);
        shown = true;
        break;
      }
    }

    // If all times have passed for today, show "No more doses"
    if (!shown) {
      oled.setCursor(0, 34);
      oled.println("No more doses");
      oled.setCursor(0, 46);
      oled.println("today");
    }
  } else {
    oled.setCursor(0, 34);
    oled.println("No doses today");
  }
  oled.display();
}


// ════════════════════════════════════════════
//  LED & BUZZER
// ════════════════════════════════════════════
void ledOn()    { digitalWrite(PIN_LED,    HIGH); }
void ledOff()   { digitalWrite(PIN_LED,    LOW);  }
void buzzerOff(){ digitalWrite(PIN_BUZZER, LOW);  }
