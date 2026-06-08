// Supabase API client — typed wrappers for all database operations.
// Replaces the old REST API client that talked to the Go backend.

import { supabase, DEVICE_ID } from '../lib/supabase';
import type {
  Medication,
  MedicationInsert,
  Schedule,
  ScheduleInsert,
  Medicine,
  DeviceSettings,
  DeviceSettingsUpdate,
  RoomMonitoring,
  TodayDose,
  DoseDisplayStatus,
} from '../lib/database.types';

// ─── Medications ────────────────────────────────────────────────────────────

export async function getMedications(): Promise<Medication[]> {
  const { data, error } = await supabase
    .from('medications')
    .select('*')
    .eq('device_id', DEVICE_ID)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createMedication(input: MedicationInsert): Promise<Medication> {
  const { data, error } = await supabase
    .from('medications')
    .insert({ ...input, device_id: DEVICE_ID })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMedication(
  id: string,
  input: Partial<MedicationInsert>,
): Promise<Medication> {
  const { data, error } = await supabase
    .from('medications')
    .update(input)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMedication(id: string): Promise<void> {
  const { error } = await supabase.from('medications').delete().eq('id', id);
  if (error) throw error;
}

// ─── Schedules ──────────────────────────────────────────────────────────────

export async function getSchedules(): Promise<(Schedule & { medication_name: string; medication_dose: string })[]> {
  const { data, error } = await supabase
    .from('schedules')
    .select('*, medications(name, dose)')
    .eq('device_id', DEVICE_ID)
    .eq('active', true)
    .order('time_of_day', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((s) => {
    const med = s.medications as unknown as { name: string; dose: string } | null;
    return {
      ...s,
      medication_name: med?.name ?? 'Unknown',
      medication_dose: med?.dose ?? '',
    };
  });
}

export async function createSchedule(input: ScheduleInsert): Promise<Schedule> {
  const { data, error } = await supabase
    .from('schedules')
    .insert({ ...input, device_id: DEVICE_ID })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createMultipleSchedules(
  medicationId: string,
  times: string[],
  daysOfWeek: string,
  startDate: string,
  endDate: string | null,
): Promise<Schedule[]> {
  const inserts: ScheduleInsert[] = times.map((t) => ({
    medication_id: medicationId,
    time_of_day: t.length === 5 ? t + ':00' : t, // "08:30" → "08:30:00"
    days_of_week: daysOfWeek,
    start_date: startDate,
    end_date: endDate,
    device_id: DEVICE_ID,
  }));
  const { data, error } = await supabase
    .from('schedules')
    .insert(inserts)
    .select();
  if (error) throw error;
  return data ?? [];
}

export async function deleteSchedule(id: string): Promise<void> {
  const { error } = await supabase.from('schedules').delete().eq('id', id);
  if (error) throw error;
}

// ─── Medicines (daily dose instances — ESP32 reads/writes these) ────────────

export async function getTodayMedicines(): Promise<Medicine[]> {
  const today = new Date().toLocaleDateString('en-CA'); // "YYYY-MM-DD"
  const { data, error } = await supabase
    .from('medicines')
    .select('*')
    .eq('device_id', DEVICE_ID)
    .eq('date', today)
    .order('time', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getWeekMedicines(days = 7): Promise<Medicine[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startStr = start.toLocaleDateString('en-CA');
  const endStr = end.toLocaleDateString('en-CA');

  const { data, error } = await supabase
    .from('medicines')
    .select('*')
    .eq('device_id', DEVICE_ID)
    .gte('date', startStr)
    .lte('date', endStr)
    .order('date', { ascending: false })
    .order('time', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Convert raw medicines into TodayDose display objects */
export function toTodayDoses(medicines: Medicine[]): TodayDose[] {
  const now = new Date();
  const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return medicines.map((m) => {
    const timeHHMM = m.time.substring(0, 5); // "HH:MM:SS" → "HH:MM"

    let displayStatus: DoseDisplayStatus;
    if (m.status === 'taken') {
      displayStatus = 'completed';
    } else if (m.status === 'missed') {
      displayStatus = 'missed';
    } else if (timeHHMM <= nowHHMM) {
      displayStatus = 'due';
    } else {
      displayStatus = 'upcoming';
    }

    return {
      id: m.id,
      medicationName: m.name,
      dose: m.dose,
      timeOfDay: timeHHMM,
      status: displayStatus,
      rawStatus: m.status,
    };
  });
}

// ─── Generate Daily Medicines (RPC) ─────────────────────────────────────────

export async function generateDailyMedicines(date?: string): Promise<Medicine[]> {
  const targetDate = date ?? new Date().toLocaleDateString('en-CA');
  const { data, error } = await supabase.rpc('generate_daily_medicines', {
    target_date: targetDate,
    target_device: DEVICE_ID,
  });
  if (error) throw error;
  return data ?? [];
}

// ─── Device Settings ────────────────────────────────────────────────────────

export async function getDeviceSettings(): Promise<DeviceSettings | null> {
  const { data, error } = await supabase
    .from('device_settings')
    .select('*')
    .eq('device_id', DEVICE_ID)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data;
}

export async function updateDeviceSettings(
  updates: DeviceSettingsUpdate,
): Promise<DeviceSettings> {
  const { data, error } = await supabase
    .from('device_settings')
    .update(updates)
    .eq('device_id', DEVICE_ID)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Events Log ─────────────────────────────────────────────────────────────

export async function getEventsLog(days = 7) {
  const start = new Date();
  start.setDate(start.getDate() - days);

  const { data, error } = await supabase
    .from('events_log')
    .select('*')
    .eq('device_id', DEVICE_ID)
    .gte('created_at', start.toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ─── Room Monitoring ────────────────────────────────────────────────────────

export async function getLatestRoomData(): Promise<RoomMonitoring | null> {
  const { data, error } = await supabase
    .from('room_monitoring')
    .select('*')
    .eq('device_id', DEVICE_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
