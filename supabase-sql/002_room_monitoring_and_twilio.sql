-- ============================================================
--  SEBAKIT — Room Monitoring & Twilio Missed Call Setup
--  Run this AFTER 001_complete_setup.sql in Supabase SQL Editor.
--  Everything is idempotent (IF NOT EXISTS / IF NOT EXISTS checks).
-- ============================================================


-- ─────────────────────────────────────────────
--  1. ROOM MONITORING TABLE
--     ESP32 posts sensor readings here every 30s
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS room_monitoring (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id     TEXT NOT NULL DEFAULT 'sevakit-001',
  temperature   REAL,                  -- °C from BME280
  humidity      REAL,                  -- % RH from BME280
  eco2          INTEGER,               -- ppm from CCS811 (400-8192)
  tvoc          INTEGER,               -- ppb from CCS811 (0-1187)
  air_quality   TEXT DEFAULT 'good',   -- computed: good / moderate / poor / hazardous
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────
--  2. INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_room_monitoring_device
  ON room_monitoring(device_id);

CREATE INDEX IF NOT EXISTS idx_room_monitoring_created
  ON room_monitoring(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_room_monitoring_device_latest
  ON room_monitoring(device_id, created_at DESC);


-- ─────────────────────────────────────────────
--  3. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────
ALTER TABLE room_monitoring ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon full access to room_monitoring" ON room_monitoring
  FOR ALL USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────
--  4. ENABLE REALTIME
--     Website receives live sensor updates
-- ─────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE room_monitoring;


-- ─────────────────────────────────────────────
--  5. ADD TWILIO / GUARDIAN COLUMNS TO device_settings
--     These let the website configure the guardian phone
--     and enable/disable Twilio missed-dose calls.
-- ─────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE device_settings ADD COLUMN guardian_phone TEXT DEFAULT '';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE device_settings ADD COLUMN twilio_call_enabled BOOLEAN DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Update the existing seed row to have the default guardian phone
UPDATE device_settings
SET guardian_phone = '+8801752863152',
    twilio_call_enabled = true
WHERE device_id = 'sevakit-001'
  AND (guardian_phone IS NULL OR guardian_phone = '');


-- ─────────────────────────────────────────────
--  6. AUTO-COMPUTE AIR QUALITY ON INSERT
--     Sets air_quality based on eCO2 levels:
--       good:      eCO2 < 800
--       moderate:  800 <= eCO2 < 1500
--       poor:      1500 <= eCO2 < 5000
--       hazardous: eCO2 >= 5000
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION compute_air_quality()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.eco2 IS NOT NULL THEN
    IF NEW.eco2 < 800 THEN
      NEW.air_quality := 'good';
    ELSIF NEW.eco2 < 1500 THEN
      NEW.air_quality := 'moderate';
    ELSIF NEW.eco2 < 5000 THEN
      NEW.air_quality := 'poor';
    ELSE
      NEW.air_quality := 'hazardous';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER set_air_quality BEFORE INSERT ON room_monitoring
    FOR EACH ROW EXECUTE FUNCTION compute_air_quality();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─────────────────────────────────────────────
--  7. CLEANUP: Keep only last 24 hours of readings
--     Call via: SELECT cleanup_old_room_data();
--     Or schedule with pg_cron if available.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_old_room_data()
RETURNS void AS $$
BEGIN
  DELETE FROM room_monitoring
  WHERE created_at < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql;


-- ─────────────────────────────────────────────
--  8. HELPER VIEW: latest_room_data
--     Get the most recent reading per device
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW latest_room_data AS
SELECT DISTINCT ON (device_id)
  *
FROM room_monitoring
ORDER BY device_id, created_at DESC;


-- ============================================================
--  DONE! Room Monitoring & Twilio setup complete.
--
--  New table: room_monitoring
--  Modified table: device_settings (added guardian_phone, twilio_call_enabled)
--  New view: latest_room_data
--  New functions: compute_air_quality(), cleanup_old_room_data()
--
--  Next steps:
--  1. Go to Table Editor → verify room_monitoring table exists
--  2. Go to Database → Replication → verify room_monitoring is in Realtime
--  3. Verify device_settings has guardian_phone column
--  4. Flash updated ESP32 firmware
-- ============================================================
