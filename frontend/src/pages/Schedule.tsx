// Schedule page — list schedules, add new, delete.

import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import {
  getSchedules,
  getMedications,
  createSchedule,
  deleteSchedule,
  type Schedule as ScheduleT,
  type ScheduleInput,
} from '../api/client';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_VALUES = ['1', '2', '3', '4', '5', '6', '7'];

export default function SchedulePage() {
  const medications = useStore((s) => s.medications);
  const schedules = useStore((s) => s.schedules);
  const setSchedules = useStore((s) => s.setSchedules);
  const setMedications = useStore((s) => s.setMedications);

  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    getMedications().then(setMedications).catch(console.error);
    getSchedules().then(setSchedules).catch(console.error);
  }, [setMedications, setSchedules]);

  // Group schedules by medicationId.
  const grouped = schedules.reduce<Record<number, { name: string; items: ScheduleT[] }>>((acc, s) => {
    if (!acc[s.medicationId]) {
      acc[s.medicationId] = { name: s.medicationName, items: [] };
    }
    acc[s.medicationId].items.push(s);
    return acc;
  }, {});

  const accentColors = ['border-sage-400', 'border-amber-400', 'border-danger-400', 'border-blue-400', 'border-purple-400'];

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await deleteSchedule(deleteId);
      setSchedules(schedules.filter((s) => s.id !== deleteId));
    } catch (e) {
      console.error(e);
    }
    setDeleteId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl text-gray-900">Schedule</h1>
        <button
          id="add-schedule-btn"
          onClick={() => setShowModal(true)}
          className="bg-sage-500 hover:bg-sage-600 text-white text-sm font-medium px-4 py-2 rounded-xl shadow-sm transition-colors"
        >
          + Add
        </button>
      </div>

      {Object.entries(grouped).map(([medId, { name, items }], idx) => (
        <div key={medId} className={`bg-white rounded-2xl border border-cream-200 shadow-sm overflow-hidden border-l-4 ${accentColors[idx % accentColors.length]}`}>
          <div className="px-4 py-3 bg-cream-100/50">
            <h3 className="font-medium text-gray-900 text-sm">{name}</h3>
          </div>
          <div className="divide-y divide-cream-100">
            {items.map((s) => (
              <div key={s.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="font-medium text-sage-600 text-sm">{to12h(s.timeOfDay)}</span>
                  <span className="text-gray-400 text-xs ml-2">
                    {formatDays(s.daysOfWeek)}
                  </span>
                  <span className="text-gray-300 text-xs ml-2">
                    {formatDateRange(s.startDate, s.endDate)}
                  </span>
                </div>
                <button
                  onClick={() => setDeleteId(s.id)}
                  className="text-gray-300 hover:text-danger-500 transition-colors p-1"
                  title="Delete"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {schedules.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          <p>No schedules yet.</p>
          <p className="mt-1">Tap + Add to create one.</p>
        </div>
      )}

      {/* Add Modal */}
      {showModal && (
        <AddModal
          medications={medications}
          onClose={() => setShowModal(false)}
          onAdd={async (input) => {
            const created = await createSchedule(input);
            setSchedules([...schedules, ...created]);
            setShowModal(false);
          }}
          onNewMedicationAdded={() => {
            getMedications().then(setMedications).catch(console.error);
          }}
        />
      )}

      {/* Delete Confirm */}
      {deleteId !== null && (
        <ConfirmDialog
          message="Delete this schedule?"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}

// ─── Add Modal ──────────────────────────────────────────────────────────────

function AddModal({
  medications,
  onClose,
  onAdd,
  onNewMedicationAdded,
}: {
  medications: { id: number; name: string; dose: string }[];
  onClose: () => void;
  onAdd: (input: ScheduleInput) => Promise<void>;
  onNewMedicationAdded: () => void;
}) {
  const [isNewMed, setIsNewMed] = useState(medications.length === 0);
  const [medId, setMedId] = useState(medications[0]?.id ?? 0);
  const [newMedName, setNewMedName] = useState('');
  const [newMedDose, setNewMedDose] = useState('');
  
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [newTime, setNewTime] = useState('08:00');
  const [days, setDays] = useState<string[]>(DAY_VALUES);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);

  const addTime = () => {
    if (newTime && !times.includes(newTime)) {
      setTimes([...times, newTime].sort());
    }
  };

  const removeTime = (t: string) => {
    setTimes(times.filter((x) => x !== t));
  };

  const toggleDay = (d: string) =>
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );

  const handleSubmit = async () => {
    if (days.length === 0 || times.length === 0) return;
    if (isNewMed && (!newMedName.trim() || !newMedDose.trim())) return;
    if (!isNewMed && medId === 0) return;
    
    setLoading(true);
    try {
      let finalMedId = medId;
      
      // Create new medication first if needed
      if (isNewMed) {
        const { createMedication } = await import('../api/client');
        const med = await createMedication({
          name: newMedName.trim(),
          dose: newMedDose.trim(),
          notes: '',
        });
        finalMedId = med.id;
        onNewMedicationAdded();
      }

      await onAdd({
        medicationId: finalMedId,
        times,
        daysOfWeek: days.join(','),
        startDate,
        endDate: endDate || null,
      });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-[360px] bg-white rounded-3xl p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg text-gray-900 mb-4">New Schedule</h2>

        {/* Medication toggle */}
        <div className="flex bg-cream-100 p-1 rounded-xl mb-4">
          <button
            onClick={() => setIsNewMed(false)}
            disabled={medications.length === 0}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              !isNewMed ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 disabled:opacity-50'
            }`}
          >
            Select Existing
          </button>
          <button
            onClick={() => setIsNewMed(true)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              isNewMed ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Create New
          </button>
        </div>

        {/* Medication input/select */}
        {!isNewMed ? (
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">Medication</label>
            <select
              value={medId}
              onChange={(e) => setMedId(Number(e.target.value))}
              className="w-full border border-cream-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sage-300 bg-white"
            >
              {medications.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.dose})</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex gap-3 mb-4">
            <div className="flex-[2]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
              <input
                type="text"
                placeholder="e.g. Aspirin"
                value={newMedName}
                onChange={(e) => setNewMedName(e.target.value)}
                className="w-full border border-cream-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sage-300"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Dose</label>
              <input
                type="text"
                placeholder="100mg"
                value={newMedDose}
                onChange={(e) => setNewMedDose(e.target.value)}
                className="w-full border border-cream-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sage-300"
              />
            </div>
          </div>
        )}

        {/* Times — multi-time chip input */}
        <label className="block text-xs font-medium text-gray-500 mb-1">Times</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {times.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 bg-sage-50 text-sage-700 text-xs font-semibold pl-2.5 pr-1 py-1 rounded-full"
            >
              {to12h(t)}
              <button
                onClick={() => removeTime(t)}
                className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-sage-200 text-sage-500 transition-colors"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 mb-4">
          <input
            type="time"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            className="flex-1 border border-cream-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-300 bg-white"
          />
          <button
            onClick={addTime}
            className="px-3 py-2 text-sm font-medium text-sage-600 bg-sage-50 rounded-xl hover:bg-sage-100 transition-colors"
          >
            + Add
          </button>
        </div>

        {/* Days checkboxes */}
        <label className="block text-xs font-medium text-gray-500 mb-2">Days</label>
        <div className="flex gap-1.5 mb-4 justify-between">
          {DAY_VALUES.map((d, i) => (
            <button
              key={d}
              onClick={() => toggleDay(d)}
              className={`w-9 h-9 rounded-full text-xs font-semibold transition-colors ${
                days.includes(d)
                  ? 'bg-sage-500 text-white'
                  : 'bg-cream-100 text-gray-400 hover:bg-cream-200'
              }`}
            >
              {DAY_NAMES[i]}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className="flex gap-3 mb-6">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-cream-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-300 bg-white"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              placeholder="Optional"
              className="w-full border border-cream-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-300 bg-white"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium text-gray-500 bg-cream-100 rounded-xl hover:bg-cream-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || (isNewMed && (!newMedName.trim() || !newMedDose.trim())) || (!isNewMed && medId === 0) || days.length === 0 || times.length === 0}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-sage-500 rounded-xl hover:bg-sage-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Dialog ─────────────────────────────────────────────────────────

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-[280px] w-full mx-4">
        <p className="text-sm text-gray-700 mb-5">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-sm font-medium text-gray-500 bg-cream-100 rounded-xl hover:bg-cream-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 text-sm font-medium text-white bg-danger-500 rounded-xl hover:bg-danger-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDays(dow: string): string {
  if (dow === '1,2,3,4,5,6,7') return 'Every day';
  if (dow === '1,2,3,4,5') return 'Weekdays';
  if (dow === '6,7') return 'Weekends';
  return dow
    .split(',')
    .map((d) => DAY_NAMES[parseInt(d) - 1] || d)
    .join(', ');
}

function formatDateRange(start: string, end: string | null): string {
  const fmtDate = (d: string) => {
    const [y, m, day] = d.split('-');
    return `${parseInt(m)}/${parseInt(day)}/${y.slice(2)}`;
  };
  if (!end) return `from ${fmtDate(start)}`;
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

/** Convert "HH:MM" (24h) → "h:mm AM/PM" */
function to12h(tod: string): string {
  const [hStr, mStr] = tod.split(':');
  let h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr} ${suffix}`;
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
