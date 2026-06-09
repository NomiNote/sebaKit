// useSupabaseRealtime — subscribes to Supabase Realtime channels for live updates.
// Replaces the old WebSocket hook that connected to the Go backend.
//
// Listens for:
//  - medicines table changes (INSERT/UPDATE) → refreshes today's doses
//  - device_settings changes (UPDATE) → refreshes settings
//  - room_monitoring table inserts (INSERT) → updates live room data

import { useEffect, useCallback } from 'react';
import { supabase, DEVICE_ID } from '../lib/supabase';
import { useStore } from '../store/useStore';
import { getTodayMedicines, toTodayDoses, getDeviceSettings, getLatestRoomData } from '../api/supabase-client';
import type { Medicine, RoomMonitoring } from '../lib/database.types';

export function useSupabaseRealtime() {
  const {
    setTodayMedicines,
    setTodayDoses,
    setDeviceSettings,
    setActiveAlert,
    resolveAlert,
    setRoomData,
    activeAlert,
  } = useStore();

  const refreshTodayData = useCallback(async () => {
    try {
      const medicines = await getTodayMedicines();
      setTodayMedicines(medicines);
      setTodayDoses(toTodayDoses(medicines));
    } catch (err) {
      console.error('[Realtime] Failed to refresh today data:', err);
    }
  }, [setTodayMedicines, setTodayDoses]);

  const refreshSettings = useCallback(async () => {
    try {
      const settings = await getDeviceSettings();
      if (settings) setDeviceSettings(settings);
    } catch (err) {
      console.error('[Realtime] Failed to refresh settings:', err);
    }
  }, [setDeviceSettings]);

  // Fetch initial room data on mount
  useEffect(() => {
    getLatestRoomData()
      .then((data) => { if (data) setRoomData(data); })
      .catch((err) => console.error('[Realtime] Failed to fetch initial room data:', err));
  }, [setRoomData]);

  useEffect(() => {
    // ── Subscribe to medicines table changes ──
    const medicinesChannel = supabase
      .channel('medicines-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'medicines',
          filter: `device_id=eq.${DEVICE_ID}`,
        },
        (payload) => {
          console.log('[Realtime] medicines change:', payload.eventType);

          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Medicine;
            const old = payload.old as Partial<Medicine>;

            // ESP32 changed status from pending → taken/missed
            if (old.status === 'pending' && (updated.status === 'taken' || updated.status === 'missed')) {
              // Resolve any active alert for this medicine
              if (activeAlert?.medicineId === updated.id) {
                resolveAlert(updated.id);
              }
            }
          }

          // Refresh all today data on any change
          refreshTodayData();
        },
      )
      .subscribe((status) => {
        console.log('[Realtime] medicines channel:', status);
      });

    // ── Subscribe to device_settings changes ──
    const settingsChannel = supabase
      .channel('settings-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'device_settings',
          filter: `device_id=eq.${DEVICE_ID}`,
        },
        () => {
          console.log('[Realtime] device_settings changed');
          refreshSettings();
        },
      )
      .subscribe((status) => {
        console.log('[Realtime] settings channel:', status);
      });

    // ── Subscribe to room_monitoring inserts (live sensor data) ──
    const roomChannel = supabase
      .channel('room-monitoring-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_monitoring',
          filter: `device_id=eq.${DEVICE_ID}`,
        },
        (payload) => {
          console.log('[Realtime] room_monitoring insert');
          const newReading = payload.new as RoomMonitoring;
          setRoomData(newReading);
        },
      )
      .subscribe((status) => {
        console.log('[Realtime] room_monitoring channel:', status);
      });

    // Cleanup on unmount
    return () => {
      supabase.removeChannel(medicinesChannel);
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [refreshTodayData, refreshSettings, activeAlert, setActiveAlert, resolveAlert, setRoomData]);
}

