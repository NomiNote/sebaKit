// Settings page — patient info and alert duration.
// Reads/writes device_settings table in Supabase.

import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { getDeviceSettings, updateDeviceSettings } from '../api/supabase-client';

export default function Settings() {
  const deviceSettings = useStore((s) => s.deviceSettings);
  const setDeviceSettings = useStore((s) => s.setDeviceSettings);

  const [name, setName] = useState(deviceSettings?.patient_name ?? 'Patient');
  const [type, setType] = useState(deviceSettings?.patient_type ?? '');
  const [duration, setDuration] = useState(String(deviceSettings?.alert_duration_min ?? 3));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getDeviceSettings()
      .then((s) => {
        if (s) {
          setDeviceSettings(s);
          setName(s.patient_name);
          setType(s.patient_type);
          setDuration(String(s.alert_duration_min));
        }
      })
      .catch(console.error);
  }, [setDeviceSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateDeviceSettings({
        patient_name: name.trim(),
        patient_type: type.trim(),
        alert_duration_min: Math.max(1, Math.min(60, parseInt(duration) || 3)),
      });
      setDeviceSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const isDirty =
    name !== (deviceSettings?.patient_name ?? '') ||
    type !== (deviceSettings?.patient_type ?? '') ||
    duration !== String(deviceSettings?.alert_duration_min ?? 3);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl text-gray-900">Settings</h1>

      {/* Patient Info */}
      <div className="bg-white rounded-2xl border border-cream-200 shadow-sm p-5 space-y-4">
        <h3 className="font-display text-sm text-gray-900">Patient Information</h3>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
          <input
            id="settings-patient-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Margaret"
            className="w-full border border-cream-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sage-300"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Relation / Type</label>
          <input
            id="settings-patient-type"
            type="text"
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="e.g. Mom, Dad, Grandma"
            className="w-full border border-cream-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sage-300"
          />
        </div>
      </div>

      {/* Alert Settings */}
      <div className="bg-white rounded-2xl border border-cream-200 shadow-sm p-5 space-y-4">
        <h3 className="font-display text-sm text-gray-900">Alert Settings</h3>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Alert Duration (minutes)
          </label>
          <input
            id="settings-alert-duration"
            type="number"
            min="1"
            max="60"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full border border-cream-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sage-300"
          />
          <p className="text-xs text-gray-400 mt-1">
            How long the ESP32 buzzer rings before marking a dose as "missed".
            The device reads this setting every 5 minutes from Supabase.
          </p>
        </div>
      </div>

      {/* Device Info */}
      <div className="bg-white rounded-2xl border border-cream-200 shadow-sm p-5 space-y-3">
        <h3 className="font-display text-sm text-gray-900">Device Info</h3>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Device ID</span>
          <span className="font-mono text-xs text-gray-700 bg-cream-100 px-2 py-1 rounded-lg">
            {deviceSettings?.device_id ?? 'sevakit-001'}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Timezone</span>
          <span className="text-gray-700">{deviceSettings?.timezone ?? 'Asia/Dhaka'}</span>
        </div>
      </div>

      {/* Save */}
      <button
        id="settings-save-btn"
        onClick={handleSave}
        disabled={saving || !isDirty}
        className={`w-full py-3 text-sm font-medium rounded-xl transition-all shadow-sm ${
          saved
            ? 'bg-sage-500 text-white'
            : isDirty
              ? 'bg-sage-500 hover:bg-sage-600 text-white active:scale-[0.98]'
              : 'bg-cream-100 text-gray-400 cursor-not-allowed'
        } disabled:opacity-50`}
      >
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
      </button>
    </div>
  );
}
