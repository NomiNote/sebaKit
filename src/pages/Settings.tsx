// Settings page — patient info, alert duration, and Twilio WhatsApp alert settings.
// Reads/writes device_settings table in Supabase.

import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { getDeviceSettings, updateDeviceSettings } from '../api/supabase-client';
import { usePWAInstall } from '../hooks/usePWAInstall';

export default function Settings() {
  const deviceSettings = useStore((s) => s.deviceSettings);
  const setDeviceSettings = useStore((s) => s.setDeviceSettings);

  const [name, setName] = useState(deviceSettings?.patient_name ?? 'Patient');
  const [type, setType] = useState(deviceSettings?.patient_type ?? '');
  const [duration, setDuration] = useState(String(deviceSettings?.alert_duration_min ?? 3));
  const [guardianPhone, setGuardianPhone] = useState(deviceSettings?.guardian_phone ?? '');
  const [twilioEnabled, setTwilioEnabled] = useState(deviceSettings?.twilio_call_enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { isInstallable, isInstalled, install } = usePWAInstall();

  const handleInstallClick = async () => {
    await install();
  };

  useEffect(() => {
    getDeviceSettings()
      .then((s) => {
        if (s) {
          setDeviceSettings(s);
          setName(s.patient_name);
          setType(s.patient_type);
          setDuration(String(s.alert_duration_min));
          setGuardianPhone(s.guardian_phone ?? '');
          setTwilioEnabled(s.twilio_call_enabled ?? true);
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
        guardian_phone: guardianPhone.trim(),
        twilio_call_enabled: twilioEnabled,
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
    duration !== String(deviceSettings?.alert_duration_min ?? 3) ||
    guardianPhone !== (deviceSettings?.guardian_phone ?? '') ||
    twilioEnabled !== (deviceSettings?.twilio_call_enabled ?? true);

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

      {/* Guardian WhatsApp Alert Settings (Twilio) */}
      <div className="bg-white rounded-2xl border border-cream-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MessageIcon className="w-4 h-4 text-sage-500" />
          <h3 className="font-display text-sm text-gray-900">Missed Dose WhatsApp Alert</h3>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Guardian Phone Number
          </label>
          <input
            id="settings-guardian-phone"
            type="tel"
            value={guardianPhone}
            onChange={(e) => setGuardianPhone(e.target.value)}
            placeholder="+8801XXXXXXXXX"
            className="w-full border border-cream-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sage-300"
          />
          <p className="text-xs text-gray-400 mt-1">
            WhatsApp number in E.164 format. The ESP32 will send a WhatsApp
            message via Twilio when a dose is missed.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Enable WhatsApp Alerts</p>
            <p className="text-xs text-gray-400">Auto-send WhatsApp message when patient misses a dose</p>
          </div>
          <button
            id="settings-twilio-toggle"
            onClick={() => setTwilioEnabled(!twilioEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
              twilioEnabled ? 'bg-sage-500' : 'bg-gray-200'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                twilioEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* App Installation */}
      <div className="bg-white rounded-2xl border border-cream-200 shadow-sm p-5 space-y-4">
        <h3 className="font-display text-sm text-gray-900">App Installation</h3>

        {isInstalled ? (
          <div className="flex items-center gap-2 text-sage-600 bg-sage-50/50 border border-sage-100 p-3.5 rounded-xl text-xs">
            <span className="font-semibold text-lg">✓</span>
            <div>
              <p className="font-medium">ShebaKit is Installed</p>
              <p className="text-gray-400 font-normal">Running as a standalone web app.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 leading-relaxed">
              Install ShebaKit on your device for quick offline access, a cleaner standalone interface, and native-like performance.
            </p>
            <button
              id="settings-install-pwa-btn"
              onClick={handleInstallClick}
              className="w-full py-2.5 bg-sage-500 hover:bg-sage-600 text-white rounded-xl text-xs font-semibold shadow-sm transition-all active:scale-[0.98]"
            >
              Install ShebaKit App
            </button>
          </div>
        )}
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
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Sensors</span>
          <span className="text-gray-700">BME280 (Temp & Humidity)</span>
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

// ─── Icons ──────────────────────────────────────────────────────────────────

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}


