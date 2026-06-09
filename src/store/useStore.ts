// Zustand store — central state for the SebaKit caregiver dashboard.
// Adapted for Supabase data model (replaces old backend-centric store).

import { create } from 'zustand';
import type { Medication, Schedule, Medicine, DeviceSettings, TodayDose, RoomMonitoring } from '../lib/database.types';

export interface ActiveAlert {
  medicineId: string;
  medicineName: string;
  scheduledTime: string;
}

interface AppState {
  // Data
  medications: Medication[];
  schedules: (Schedule & { medication_name: string; medication_dose: string })[];
  todayMedicines: Medicine[];
  weekMedicines: Medicine[];
  todayDoses: TodayDose[];
  deviceSettings: DeviceSettings | null;
  roomData: RoomMonitoring | null;

  // UI state
  activeAlert: ActiveAlert | null;

  // Setters
  setMedications: (m: Medication[]) => void;
  setSchedules: (s: (Schedule & { medication_name: string; medication_dose: string })[]) => void;
  setTodayMedicines: (m: Medicine[]) => void;
  setWeekMedicines: (m: Medicine[]) => void;
  setTodayDoses: (d: TodayDose[]) => void;
  setDeviceSettings: (s: DeviceSettings) => void;
  setRoomData: (r: RoomMonitoring) => void;

  // Alert actions
  setActiveAlert: (a: ActiveAlert) => void;
  clearAlert: () => void;
  resolveAlert: (medicineId: string) => void;

  // Medicine status update (optimistic UI)
  patchMedicine: (medicineId: string, status: 'taken' | 'missed') => void;
}

export const useStore = create<AppState>((set) => ({
  medications: [],
  schedules: [],
  todayMedicines: [],
  weekMedicines: [],
  todayDoses: [],
  deviceSettings: null,
  roomData: null,
  activeAlert: null,

  setMedications: (medications) => set({ medications }),
  setSchedules: (schedules) => set({ schedules }),
  setTodayMedicines: (todayMedicines) => set({ todayMedicines }),
  setWeekMedicines: (weekMedicines) => set({ weekMedicines }),
  setTodayDoses: (todayDoses) => set({ todayDoses }),
  setDeviceSettings: (deviceSettings) => set({ deviceSettings }),
  setRoomData: (roomData) => set({ roomData }),

  setActiveAlert: (activeAlert) => set({ activeAlert }),
  clearAlert: () => set({ activeAlert: null }),
  resolveAlert: (medicineId) =>
    set((s) =>
      s.activeAlert?.medicineId === medicineId ? { activeAlert: null } : {},
    ),

  patchMedicine: (medicineId, status) =>
    set((s) => ({
      todayMedicines: s.todayMedicines.map((m) =>
        m.id === medicineId
          ? { ...m, status, taken_at: status === 'taken' ? new Date().toISOString() : m.taken_at }
          : m,
      ),
      weekMedicines: s.weekMedicines.map((m) =>
        m.id === medicineId
          ? { ...m, status, taken_at: status === 'taken' ? new Date().toISOString() : m.taken_at }
          : m,
      ),
      todayDoses: s.todayDoses.map((d) =>
        d.id === medicineId
          ? { ...d, status: status === 'taken' ? 'completed' : 'missed', rawStatus: status }
          : d,
      ),
    })),
}));

