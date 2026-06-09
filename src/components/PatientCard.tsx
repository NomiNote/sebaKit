// PatientCard — hero card showing patient info and device connection status.
// Reads patient name/type from device_settings via Supabase.

import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { getDeviceSettings } from '../api/supabase-client';

export default function PatientCard() {
  const deviceSettings = useStore((s) => s.deviceSettings);
  const setDeviceSettings = useStore((s) => s.setDeviceSettings);

  useEffect(() => {
    getDeviceSettings()
      .then((s) => { if (s) setDeviceSettings(s); })
      .catch(console.error);
  }, [setDeviceSettings]);

  const name = deviceSettings?.patient_name || 'Patient';
  const type = deviceSettings?.patient_type || '';
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-cream-200 transition-all hover:shadow-md">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-sage-400 to-sage-600 flex items-center justify-center text-white font-display text-xl font-bold shrink-0 shadow-md shadow-sage-200/50">
          {initial}
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="font-display text-lg text-gray-900 leading-tight">
            {name}{' '}
            {type && <span className="text-gray-400 font-body text-sm">({type})</span>}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Patient</p>
        </div>

        {/* Device badge — since ESP32 uses HTTP polling, we show a static indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-sage-50 text-sage-600">
          <span className="w-2 h-2 rounded-full bg-sage-500 animate-pulse" />
          IoT Active
        </div>
      </div>
    </div>
  );
}
