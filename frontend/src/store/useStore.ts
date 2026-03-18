// Zustand store — central state for the caregiver dashboard.

import { create } from 'zustand';
import type { Medication, Schedule, MedEvent } from '../api/client';

export interface ActiveAlert {
  eventId: number;
  medicationName: string;
  scheduledAt: string;
}

interface AppState {
  medications: Medication[];
  schedules: Schedule[];
  todayEvents: MedEvent[];
  weekEvents: MedEvent[];
  deviceConnected: boolean;
  activeAlert: ActiveAlert | null;

  setMedications: (m: Medication[]) => void;
  setSchedules: (s: Schedule[]) => void;
  setTodayEvents: (e: MedEvent[]) => void;
  setWeekEvents: (e: MedEvent[]) => void;
  setDeviceConnected: (c: boolean) => void;
  setActiveAlert: (a: ActiveAlert) => void;
  resolveAlert: (eventId: number) => void;
  patchEvent: (eventId: number, status: 'completed' | 'missed') => void;
}

export const useStore = create<AppState>((set) => ({
  medications: [],
  schedules: [],
  todayEvents: [],
  weekEvents: [],
  deviceConnected: false,
  activeAlert: null,

  setMedications: (medications) => set({ medications }),
  setSchedules: (schedules) => set({ schedules }),
  setTodayEvents: (todayEvents) => set({ todayEvents }),
  setWeekEvents: (weekEvents) => set({ weekEvents }),
  setDeviceConnected: (deviceConnected) => set({ deviceConnected }),

  setActiveAlert: (activeAlert) => set({ activeAlert }),

  resolveAlert: (eventId) =>
    set((s) => (s.activeAlert?.eventId === eventId ? { activeAlert: null } : {})),

  patchEvent: (eventId, status) =>
    set((s) => ({
      todayEvents: s.todayEvents.map((e) =>
        e.id === eventId
          ? { ...e, status, completedAt: status === 'completed' ? new Date().toISOString() : e.completedAt, confirmedByDevice: status === 'completed' }
          : e,
      ),
      weekEvents: s.weekEvents.map((e) =>
        e.id === eventId
          ? { ...e, status, completedAt: status === 'completed' ? new Date().toISOString() : e.completedAt, confirmedByDevice: status === 'completed' }
          : e,
      ),
    })),
}));
