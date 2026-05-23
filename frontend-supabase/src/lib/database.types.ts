// Database types — matches the Supabase schema defined in supabase-sql/001_complete_setup.sql

export type MedicineStatus = 'pending' | 'taken' | 'missed';

// ─── medications table ─────────────────────────────────────────────
export interface Medication {
  id: string;
  device_id: string;
  name: string;
  dose: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface MedicationInsert {
  name: string;
  dose?: string;
  notes?: string;
  device_id?: string;
}

// ─── schedules table ───────────────────────────────────────────────
export interface Schedule {
  id: string;
  medication_id: string;
  device_id: string;
  time_of_day: string;       // "HH:MM:SS"
  days_of_week: string;      // "1,2,3,4,5,6,7"
  start_date: string;        // "YYYY-MM-DD"
  end_date: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  // Joined field (from medications)
  medications?: Pick<Medication, 'name' | 'dose'>;
}

export interface ScheduleInsert {
  medication_id: string;
  time_of_day: string;
  days_of_week: string;
  start_date: string;
  end_date?: string | null;
  device_id?: string;
}

// ─── medicines table (daily dose instances — ESP32 reads this) ─────
export interface Medicine {
  id: string;
  medication_id: string | null;
  schedule_id: string | null;
  device_id: string;
  name: string;
  dose: string;
  time: string;               // "HH:MM:SS"
  date: string;               // "YYYY-MM-DD"
  status: MedicineStatus;
  taken_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── device_settings table ─────────────────────────────────────────
export interface DeviceSettings {
  id: string;
  device_id: string;
  patient_name: string;
  patient_type: string;
  alert_duration_min: number;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface DeviceSettingsUpdate {
  patient_name?: string;
  patient_type?: string;
  alert_duration_min?: number;
  timezone?: string;
}

// ─── events_log table ──────────────────────────────────────────────
export interface EventLog {
  id: string;
  medicine_id: string | null;
  device_id: string;
  event_type: 'created' | 'taken' | 'missed' | 'skipped';
  details: Record<string, unknown>;
  created_at: string;
}

// ─── Computed types for UI ─────────────────────────────────────────
export type DoseDisplayStatus = 'upcoming' | 'pending' | 'completed' | 'missed' | 'due';

export interface TodayDose {
  id: string;
  medicationName: string;
  dose: string;
  timeOfDay: string;       // "HH:MM"
  status: DoseDisplayStatus;
  rawStatus: MedicineStatus;
}
