-- ============================================================
--  SEBAKIT — Complete Supabase Setup
--  Copy-paste this entire file into your Supabase SQL Editor
--  and click "Run" — everything is idempotent (IF NOT EXISTS).
--
--  Tables: medications, schedules, medicines, device_settings, events_log
--  Includes: RLS policies, indexes, functions, triggers, realtime
-- ============================================================


-- ─────────────────────────────────────────────
--  1. EXTENSIONS
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ─────────────────────────────────────────────
--  2. CUSTOM TYPES
-- ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE medicine_status AS ENUM ('pending', 'taken', 'missed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE event_type AS ENUM ('created', 'taken', 'missed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─────────────────────────────────────────────
--  3. TABLES
-- ─────────────────────────────────────────────

-- 3a. medications — the "catalog" of medicines
CREATE TABLE IF NOT EXISTS medications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id   TEXT NOT NULL DEFAULT 'sevakit-001',
  name        TEXT NOT NULL,
  dose        TEXT DEFAULT '',
  notes       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3b. schedules — recurring schedule rules
CREATE TABLE IF NOT EXISTS schedules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medication_id   UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL DEFAULT 'sevakit-001',
  time_of_day     TIME NOT NULL,                          -- e.g. 08:30:00
  days_of_week    TEXT NOT NULL DEFAULT '1,2,3,4,5,6,7',  -- ISO Mon=1..Sun=7
  start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date        DATE,                                    -- NULL = no end
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3c. medicines — concrete daily dose instances (ESP32 reads this table)
CREATE TABLE IF NOT EXISTS medicines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medication_id   UUID REFERENCES medications(id) ON DELETE SET NULL,
  schedule_id     UUID REFERENCES schedules(id) ON DELETE SET NULL,
  device_id       TEXT NOT NULL DEFAULT 'sevakit-001',
  name            TEXT NOT NULL,
  dose            TEXT DEFAULT '',
  time            TIME NOT NULL,
  date            DATE NOT NULL,
  status          medicine_status NOT NULL DEFAULT 'pending',
  taken_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3d. device_settings — per-device configuration
CREATE TABLE IF NOT EXISTS device_settings (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id           TEXT UNIQUE NOT NULL DEFAULT 'sevakit-001',
  patient_name        TEXT NOT NULL DEFAULT 'Patient',
  patient_type        TEXT DEFAULT '',
  alert_duration_min  INTEGER NOT NULL DEFAULT 3,    -- minutes the buzzer rings before marking "missed"
  timezone            TEXT NOT NULL DEFAULT 'Asia/Dhaka',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3e. events_log — historical audit trail
CREATE TABLE IF NOT EXISTS events_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medicine_id UUID REFERENCES medicines(id) ON DELETE SET NULL,
  device_id   TEXT NOT NULL DEFAULT 'sevakit-001',
  event_type  event_type NOT NULL,
  details     JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────
--  4. INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_medications_device     ON medications(device_id);
CREATE INDEX IF NOT EXISTS idx_schedules_medication   ON schedules(medication_id);
CREATE INDEX IF NOT EXISTS idx_schedules_device       ON schedules(device_id);
CREATE INDEX IF NOT EXISTS idx_schedules_active       ON schedules(device_id, active);
CREATE INDEX IF NOT EXISTS idx_medicines_device_date  ON medicines(device_id, date, status);
CREATE INDEX IF NOT EXISTS idx_medicines_date_status  ON medicines(date, status);
CREATE INDEX IF NOT EXISTS idx_medicines_schedule     ON medicines(schedule_id);
CREATE INDEX IF NOT EXISTS idx_events_log_device      ON events_log(device_id);
CREATE INDEX IF NOT EXISTS idx_events_log_medicine    ON events_log(medicine_id);
CREATE INDEX IF NOT EXISTS idx_events_log_created     ON events_log(created_at DESC);


-- ─────────────────────────────────────────────
--  5. AUTO-UPDATE updated_at TRIGGER
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON medications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON medicines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON device_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─────────────────────────────────────────────
--  6. AUTO-LOG EVENTS ON STATUS CHANGE
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_medicine_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log when status actually changes
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('taken', 'missed') THEN
    -- Set taken_at timestamp when medicine is taken
    IF NEW.status = 'taken' THEN
      NEW.taken_at = now();
    END IF;

    INSERT INTO events_log (medicine_id, device_id, event_type, details)
    VALUES (
      NEW.id,
      NEW.device_id,
      NEW.status::text::event_type,
      jsonb_build_object(
        'medicine_name', NEW.name,
        'scheduled_time', NEW.time::text,
        'scheduled_date', NEW.date::text,
        'previous_status', OLD.status::text
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER on_medicine_status_change BEFORE UPDATE ON medicines
    FOR EACH ROW EXECUTE FUNCTION log_medicine_status_change();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─────────────────────────────────────────────
--  7. GENERATE DAILY MEDICINES FUNCTION
--     Call via: SELECT generate_daily_medicines('2026-05-23', 'sevakit-001');
--     Or from frontend via: supabase.rpc('generate_daily_medicines', { ... })
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_daily_medicines(
  target_date    DATE,
  target_device  TEXT DEFAULT 'sevakit-001'
)
RETURNS SETOF medicines AS $$
DECLARE
  sched   RECORD;
  dow_iso INTEGER;
  med_row medicines%ROWTYPE;
BEGIN
  -- Get ISO day of week (1=Mon .. 7=Sun) from target_date
  dow_iso := EXTRACT(ISODOW FROM target_date);

  FOR sched IN
    SELECT s.*, m.name AS med_name, m.dose AS med_dose
    FROM schedules s
    JOIN medications m ON m.id = s.medication_id
    WHERE s.device_id = target_device
      AND s.active = true
      AND s.start_date <= target_date
      AND (s.end_date IS NULL OR s.end_date >= target_date)
      -- Check if this day-of-week is in the schedule
      AND position(dow_iso::text IN s.days_of_week) > 0
  LOOP
    -- Skip if a medicine row already exists for this schedule+date
    IF NOT EXISTS (
      SELECT 1 FROM medicines
      WHERE schedule_id = sched.id
        AND date = target_date
        AND device_id = target_device
    ) THEN
      INSERT INTO medicines (medication_id, schedule_id, device_id, name, dose, time, date, status)
      VALUES (
        sched.medication_id,
        sched.id,
        target_device,
        sched.med_name,
        sched.med_dose,
        sched.time_of_day,
        target_date,
        'pending'
      )
      RETURNING * INTO med_row;

      RETURN NEXT med_row;
    END IF;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql;


-- ─────────────────────────────────────────────
--  8. ROW LEVEL SECURITY (RLS)
--     Using anon key for both website and ESP32
-- ─────────────────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE medications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE events_log     ENABLE ROW LEVEL SECURITY;

-- Policies for medications
CREATE POLICY "Allow anon full access to medications" ON medications
  FOR ALL USING (true) WITH CHECK (true);

-- Policies for schedules
CREATE POLICY "Allow anon full access to schedules" ON schedules
  FOR ALL USING (true) WITH CHECK (true);

-- Policies for medicines
CREATE POLICY "Allow anon full access to medicines" ON medicines
  FOR ALL USING (true) WITH CHECK (true);

-- Policies for device_settings
CREATE POLICY "Allow anon full access to device_settings" ON device_settings
  FOR ALL USING (true) WITH CHECK (true);

-- Policies for events_log
CREATE POLICY "Allow anon full access to events_log" ON events_log
  FOR ALL USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────
--  9. ENABLE REALTIME
--     This lets the website receive live updates
--     when ESP32 changes medicine status
-- ─────────────────────────────────────────────

-- Add tables to the Supabase Realtime publication
-- Note: Run these one at a time if you get errors
ALTER PUBLICATION supabase_realtime ADD TABLE medicines;
ALTER PUBLICATION supabase_realtime ADD TABLE device_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE events_log;


-- ─────────────────────────────────────────────
--  10. SEED DEFAULT DEVICE SETTINGS
-- ─────────────────────────────────────────────
INSERT INTO device_settings (device_id, patient_name, patient_type, alert_duration_min, timezone)
VALUES ('sevakit-001', 'Patient', '', 3, 'Asia/Dhaka')
ON CONFLICT (device_id) DO NOTHING;


-- ─────────────────────────────────────────────
--  11. HELPER VIEW: today_medicines
--      Convenient view for querying today's doses
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW today_medicines AS
SELECT
  m.*,
  CASE
    WHEN m.status = 'taken'   THEN 'completed'
    WHEN m.status = 'missed'  THEN 'missed'
    WHEN m.status = 'pending' AND m.time <= CURRENT_TIME THEN 'due'
    WHEN m.status = 'pending' AND m.time > CURRENT_TIME  THEN 'upcoming'
    ELSE 'pending'
  END AS display_status
FROM medicines m
WHERE m.date = CURRENT_DATE
ORDER BY m.time ASC;


-- ============================================================
--  DONE! Your Supabase project is now configured for SebaKit.
--
--  Next steps:
--  1. Go to Table Editor → verify all 5 tables exist
--  2. Go to Database → Replication → verify medicines,
--     device_settings, events_log are in Realtime
--  3. Copy your Supabase URL + anon key into:
--     - frontend-supabase/.env
--     - ESP32_c3/sebakit_firmware.ino
-- ============================================================
