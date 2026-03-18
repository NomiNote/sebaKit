// API client — typed fetch wrappers for the backend REST API.

const BASE = '/api';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Medication {
  id: number;
  name: string;
  dose: string;
  notes: string;
  createdAt: string;
}

export interface MedicationInput {
  name: string;
  dose: string;
  notes: string;
}

export interface Schedule {
  id: number;
  medicationId: number;
  medicationName: string;
  timeOfDay: string;
  daysOfWeek: string;
  active: boolean;
}

export interface ScheduleInput {
  medicationId: number;
  timeOfDay: string;
  daysOfWeek: string;
}

export interface MedEvent {
  id: number;
  medicationId: number;
  medicationName: string;
  scheduleId: number | null;
  scheduledAt: string;
  completedAt: string;
  status: 'pending' | 'completed' | 'missed';
  confirmedByDevice: boolean;
}

export interface StatusInfo {
  deviceConnected: boolean;
  pendingCount: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Medications ────────────────────────────────────────────────────────────

export const getMedications = (): Promise<Medication[]> =>
  fetch(`${BASE}/medications`).then((r) => json<Medication[]>(r));

export const createMedication = (data: MedicationInput): Promise<Medication> =>
  fetch(`${BASE}/medications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((r) => json<Medication>(r));

export const updateMedication = (id: number, data: MedicationInput): Promise<Medication> =>
  fetch(`${BASE}/medications/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((r) => json<Medication>(r));

export const deleteMedication = (id: number): Promise<void> =>
  fetch(`${BASE}/medications/${id}`, { method: 'DELETE' }).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
  });

// ─── Schedules ──────────────────────────────────────────────────────────────

export const getSchedules = (): Promise<Schedule[]> =>
  fetch(`${BASE}/schedules`).then((r) => json<Schedule[]>(r));

export const createSchedule = (data: ScheduleInput): Promise<Schedule> =>
  fetch(`${BASE}/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((r) => json<Schedule>(r));

export const deleteSchedule = (id: number): Promise<void> =>
  fetch(`${BASE}/schedules/${id}`, { method: 'DELETE' }).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
  });

// ─── Events ─────────────────────────────────────────────────────────────────

export const getEvents = (days = 7): Promise<MedEvent[]> =>
  fetch(`${BASE}/events?days=${days}`).then((r) => json<MedEvent[]>(r));

// ─── Status ─────────────────────────────────────────────────────────────────

export const getStatus = (): Promise<StatusInfo> =>
  fetch(`${BASE}/status`).then((r) => json<StatusInfo>(r));

// ─── Debug ──────────────────────────────────────────────────────────────────

export const debugTrigger = (): Promise<{ eventId: number; medicationName: string }> =>
  fetch(`${BASE}/debug/trigger`, { method: 'POST' }).then((r) =>
    json<{ eventId: number; medicationName: string }>(r),
  );
