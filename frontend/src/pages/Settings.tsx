// Settings page — patient info and alert duration.

import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { getSettings, updateSettings } from '../api/client';

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);

  const [name, setName] = useState(settings.patient_name);
  const [type, setType] = useState(settings.patient_type);
  const [duration, setDuration] = useState(settings.alert_duration);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setName(s.patient_name);
      setType(s.patient_type);
      setDuration(s.alert_duration);
    }).catch(console.error);
  }, [setSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateSettings({
        patient_name: name.trim(),
        patient_type: type.trim(),
        alert_duration: String(parseInt(duration) || 5),
      });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const isDirty =
    name !== settings.patient_name ||
    type !== settings.patient_type ||
    duration !== settings.alert_duration;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl text-gray-900">Settings</h1>

      {/* Patient Info */}
      <div className="bg-white rounded-2xl border border-cream-200 shadow-sm p-5 space-y-4">
        <h3 className="font-display text-sm text-gray-900">Patient Information</h3>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
          <input
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
            type="number"
            min="1"
            max="60"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full border border-cream-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sage-300"
          />
          <p className="text-xs text-gray-400 mt-1">
            How long the pill box alert sound plays when a dose is triggered.
          </p>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving || !isDirty}
        className={`w-full py-3 text-sm font-medium rounded-xl transition-colors shadow-sm ${
          saved
            ? 'bg-sage-500 text-white'
            : isDirty
              ? 'bg-sage-500 hover:bg-sage-600 text-white'
              : 'bg-cream-100 text-gray-400 cursor-not-allowed'
        } disabled:opacity-50`}
      >
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
      </button>
    </div>
  );
}
