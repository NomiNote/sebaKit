#include <ArduinoJson.h>
#include <WebSocketsClient.h>
#include <WiFi.h>


// =========================
// Configuration
// =========================

static const char *WIFI_SSID = "Mafuj";
static const char *WIFI_PASSWORD = "56469288";

static const char *WS_HOST = "ahlam.local";
static const uint16_t WS_PORT = 8080;
static const char *WS_PATH = "/ws/device";

static const char *DEVICE_ID = "pill-box-01";

// GPIOs
static const int REED_PIN = 5;
static const int LED_PIN = 6;
static const int BUZZER_PIN = 21;

// Timing
static const unsigned long WIFI_RETRY_MS = 5000;
static const unsigned long STATUS_LOG_INTERVAL_MS = 10000;
static const unsigned long REED_DEBOUNCE_MS = 60;
static const unsigned long LED_BLINK_MS = 300;

// =========================
// Globals
// =========================

WebSocketsClient webSocket;

bool wsConnected = false;
bool helloSent = false;

bool alertActive = false;
bool alertCompleted = false;
bool alertMissed = false;

unsigned long alertStartedAtMs = 0;
unsigned long alertDurationMs = 0;

bool lastStableReedState = HIGH;
bool lastRawReedState = HIGH;
unsigned long lastReedChangeMs = 0;

bool ledState = false;
unsigned long lastLedToggleMs = 0;

unsigned long lastWifiAttemptMs = 0;
unsigned long lastStatusLogMs = 0;

// =========================
// Helpers
// =========================

void buzzerOn() {
  delay(500);
  tone(BUZZER_PIN, 2000);
}

void buzzerOff() { noTone(BUZZER_PIN); }

void setLed(bool on) {
  ledState = on;
  digitalWrite(LED_PIN, on ? HIGH : LOW);
}

void startAlertVisual() {
  lastLedToggleMs = millis();
  setLed(true);
  buzzerOn();
}

void stopAlertVisual() {
  setLed(false);
  buzzerOff();
}

void blinkAlertVisual() {
  if (!alertActive) {
    stopAlertVisual();
    return;
  }

  unsigned long now = millis();
  if (now - lastLedToggleMs >= LED_BLINK_MS) {
    lastLedToggleMs = now;
    setLed(!ledState);
  }
}

void logLine(const char *msg) { Serial.println(msg); }

void sendHello() {
  StaticJsonDocument<128> doc;
  doc["type"] = "hello";
  doc["deviceId"] = DEVICE_ID;

  char buffer[128];
  size_t len = serializeJson(doc, buffer);

  webSocket.sendTXT((uint8_t *)buffer, len);
  helloSent = true;

  Serial.print("[WS] Sent hello: ");
  Serial.println(buffer);
}

void sendAck(const char *status) {
  if (!wsConnected) {
    Serial.println("[WS] Cannot send ack: not connected");
    return;
  }

  StaticJsonDocument<128> doc;
  doc["type"] = "ack";
  doc["status"] = status;

  char buffer[128];
  size_t len = serializeJson(doc, buffer);

  webSocket.sendTXT((uint8_t *)buffer, len);

  Serial.print("[WS] Sent ack: ");
  Serial.println(buffer);
}

void clearAlertState() {
  alertActive = false;
  alertCompleted = false;
  alertMissed = false;
  alertStartedAtMs = 0;
  alertDurationMs = 0;
  stopAlertVisual();
}

void startAlert(unsigned long durationMinutes) {
  alertActive = true;
  alertCompleted = false;
  alertMissed = false;
  alertStartedAtMs = millis();
  alertDurationMs = durationMinutes * 60UL * 1000UL;

  startAlertVisual();

  Serial.print("[ALERT] Trigger received. Duration (min): ");
  Serial.println(durationMinutes);
}

void completeAlert() {
  if (!alertActive)
    return;

  alertCompleted = true;
  alertActive = false;
  stopAlertVisual();

  sendAck("completed");
  Serial.println("[ALERT] Completed");
}

void missAlert() {
  if (!alertActive)
    return;

  alertMissed = true;
  alertActive = false;
  stopAlertVisual();

  sendAck("missed");
  Serial.println("[ALERT] Missed");
}

void handleTriggerMessage(const JsonDocument &doc) {
  if (!doc["duration"].is<int>() && !doc["duration"].is<unsigned long>()) {
    Serial.println("[JSON] trigger missing valid duration");
    return;
  }

  unsigned long duration = doc["duration"].as<unsigned long>();
  startAlert(duration);
}

void handleTextMessage(const char *payload, size_t length) {
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.print("[JSON] Parse error: ");
    Serial.println(err.c_str());
    return;
  }

  const char *type = doc["type"];
  if (type == nullptr) {
    Serial.println("[JSON] Missing type");
    return;
  }

  Serial.print("[WS] RX: ");
  Serial.write((const uint8_t *)payload, length);
  Serial.println();

  if (strcmp(type, "trigger") == 0) {
    handleTriggerMessage(doc);
    return;
  }

  Serial.print("[WS] Ignoring message type: ");
  Serial.println(type);
}

void connectWiFiIfNeeded() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  unsigned long now = millis();
  if (now - lastWifiAttemptMs < WIFI_RETRY_MS) {
    return;
  }
  lastWifiAttemptMs = now;

  Serial.print("[WiFi] Connecting to ");
  Serial.println(WIFI_SSID);

  WiFi.disconnect(true, true);
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void beginWebSocket() {
  webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
  webSocket.setReconnectInterval(3000);
  webSocket.enableHeartbeat(15000, 3000, 2);

  webSocket.onEvent([](WStype_t type, uint8_t *payload, size_t length) {
    switch (type) {
    case WStype_DISCONNECTED:
      wsConnected = false;
      helloSent = false;
      Serial.println("[WS] Disconnected");
      break;

    case WStype_CONNECTED:
      wsConnected = true;
      helloSent = false;
      Serial.print("[WS] Connected to: ");
      if (payload && length > 0) {
        Serial.write(payload, length);
      }
      Serial.println();
      sendHello();
      break;

    case WStype_TEXT:
      handleTextMessage((const char *)payload, length);
      break;

    case WStype_BIN:
      Serial.println("[WS] Ignoring binary frame");
      break;

    case WStype_PING:
    case WStype_PONG:
    case WStype_ERROR:
    case WStype_FRAGMENT_TEXT_START:
    case WStype_FRAGMENT_BIN_START:
    case WStype_FRAGMENT:
    case WStype_FRAGMENT_FIN:
    default:
      break;
    }
  });
}

// =========================
// Reed Switch (FIXED LOGIC)
// =========================
// INPUT_PULLUP + reed switch to GND:
//   LOW  = magnet present (medicine NOT taken)
//   HIGH = magnet removed (medicine TAKEN)
//
// completeAlert() fires ONLY on LOW→HIGH transition,
// so the magnet must have been attached when the alert
// started — removing it is the deliberate "taken" action.
// =========================

void updateReedSwitch() {
  bool raw = digitalRead(REED_PIN);

  if (raw != lastRawReedState) {
    lastRawReedState = raw;
    lastReedChangeMs = millis();
  }

  if ((millis() - lastReedChangeMs) >= REED_DEBOUNCE_MS) {
    if (lastStableReedState != lastRawReedState) {

      bool previousState = lastStableReedState; // save old stable state
      lastStableReedState = lastRawReedState;   // update to new stable state

      Serial.print("[REED] Stable state changed: ");
      Serial.println(lastStableReedState == HIGH ? "HIGH (magnet removed)"
                                                 : "LOW (magnet present)");

      // Only complete alert on LOW→HIGH (magnet physically removed)
      bool magnetRemoved =
          (previousState == LOW && lastStableReedState == HIGH);
      if (alertActive && magnetRemoved) {
        completeAlert();
      }
    }
  }
}

void updateAlertTimeout() {
  if (!alertActive)
    return;

  unsigned long now = millis();
  if (now - alertStartedAtMs >= alertDurationMs) {
    missAlert();
  }
}

void logPeriodicStatus() {
  unsigned long now = millis();
  if (now - lastStatusLogMs < STATUS_LOG_INTERVAL_MS) {
    return;
  }
  lastStatusLogMs = now;

  Serial.print("[STATUS] WiFi=");
  Serial.print(WiFi.status() == WL_CONNECTED ? "up" : "down");
  Serial.print(" WS=");
  Serial.print(wsConnected ? "up" : "down");
  Serial.print(" Alert=");
  Serial.print(alertActive ? "active" : "idle");
  Serial.print(" Reed=");
  Serial.println(lastStableReedState == HIGH ? "HIGH (no magnet)"
                                             : "LOW (magnet on)");
}

// =========================
// Arduino entry points
// =========================

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(REED_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  stopAlertVisual();

  lastRawReedState = digitalRead(REED_PIN);
  lastStableReedState = lastRawReedState;
  lastReedChangeMs = millis();

  Serial.println();
  Serial.println("=== ESP32 Pill Box Device ===");
  Serial.print("Device ID: ");
  Serial.println(DEVICE_ID);
  Serial.print("Initial reed state: ");
  Serial.println(lastStableReedState == HIGH ? "HIGH (no magnet)"
                                             : "LOW (magnet on)");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  beginWebSocket();
}

void loop() {
  connectWiFiIfNeeded();

  webSocket.loop();
  updateReedSwitch();
  updateAlertTimeout();
  blinkAlertVisual();
  logPeriodicStatus();
}
