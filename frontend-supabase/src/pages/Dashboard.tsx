// Dashboard page — main view with patient card, status hero, dose list, streak, and generate button.
// Fetches data from Supabase instead of the old Go backend.

import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import {
  getTodayMedicines,
  getWeekMedicines,
  toTodayDoses,
  generateDailyMedicines,
} from '../api/supabase-client';
import PatientCard from '../components/PatientCard';
import StreakWidget from '../components/StreakWidget';
import type { TodayDose } from '../lib/database.types';

/** Convert "HH:MM" (24h) → "h:mm AM/PM" */
function to12h(tod: string): string {
  const [hStr, mStr] = tod.split(':');
  let h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr} ${suffix}`;
}

function statusChip(status: TodayDose['status']) {
  switch (status) {
    case 'completed':
      return { label: 'Taken', cls: 'bg-sage-50 text-sage-600' };
    case 'missed':
      return { label: 'Missed', cls: 'bg-danger-50 text-danger-500' };
    case 'due':
      return { label: 'Overdue', cls: 'bg-danger-50 text-danger-500' };
    case 'upcoming':
    default:
      return { label: 'Upcoming', cls: 'bg-sky-50 text-sky-600' };
  }
}

export default function Dashboard() {
  const todayDoses = useStore((s) => s.todayDoses);
  const weekMedicines = useStore((s) => s.weekMedicines);
  const setTodayMedicines = useStore((s) => s.setTodayMedicines);
  const setTodayDoses = useStore((s) => s.setTodayDoses);
  const setWeekMedicines = useStore((s) => s.setWeekMedicines);
  const deviceSettings = useStore((s) => s.deviceSettings);

  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState('');

  const patientName = deviceSettings?.patient_name || 'the patient';

  useEffect(() => {
    // Fetch today's medicines
    getTodayMedicines()
      .then((meds) => {
        setTodayMedicines(meds);
        setTodayDoses(toTodayDoses(meds));
      })
      .catch(console.error);

    // Fetch week's medicines for streak
    getWeekMedicines(7).then(setWeekMedicines).catch(console.error);
  }, [setTodayMedicines, setTodayDoses, setWeekMedicines]);

  // Generate today's medicines from schedules
  const handleGenerate = async () => {
    setGenerating(true);
    setGenMessage('');
    try {
      const generated = await generateDailyMedicines();
      if (generated.length > 0) {
        setGenMessage(`✓ Generated ${generated.length} dose${generated.length !== 1 ? 's' : ''}`);
      } else {
        setGenMessage('No new doses to generate');
      }
      // Refresh
      const meds = await getTodayMedicines();
      setTodayMedicines(meds);
      setTodayDoses(toTodayDoses(meds));
      const week = await getWeekMedicines(7);
      setWeekMedicines(week);
    } catch (err) {
      console.error(err);
      setGenMessage('Error generating doses');
    }
    setGenerating(false);
    setTimeout(() => setGenMessage(''), 3000);
  };

  // Status hero card
  const totalDoses = todayDoses.length;
  const completedDoses = todayDoses.filter((d) => d.status === 'completed').length;
  const missedDoses = todayDoses.filter((d) => d.status === 'missed').length;
  const dueDoses = todayDoses.filter((d) => d.status === 'due').length;
  const upcomingDoses = todayDoses.filter((d) => d.status === 'upcoming').length;

  let heroColor = 'from-sage-500 to-sage-600';
  let heroLabel = 'All clear';
  let heroSub = 'No medications scheduled today';

  if (totalDoses > 0) {
    if (missedDoses > 0) {
      heroColor = 'from-danger-400 to-danger-500';
      heroLabel = `${missedDoses} Missed`;
      heroSub = `Please check on ${patientName}`;
    } else if (dueDoses > 0) {
      heroColor = 'from-amber-400 to-amber-500';
      heroLabel = `${dueDoses} Overdue`;
      heroSub = 'Doses past their scheduled time';
    } else if (completedDoses === totalDoses) {
      heroColor = 'from-sage-500 to-sage-600';
      heroLabel = 'All Taken ✓';
      heroSub = `${completedDoses} dose${completedDoses !== 1 ? 's' : ''} confirmed today`;
    } else if (upcomingDoses > 0 && completedDoses > 0) {
      heroColor = 'from-sage-500 to-sage-600';
      heroLabel = `${completedDoses}/${totalDoses} Taken`;
      heroSub = `${upcomingDoses} more dose${upcomingDoses !== 1 ? 's' : ''} coming up`;
    } else {
      heroColor = 'from-sky-400 to-sky-500';
      heroLabel = `${upcomingDoses} Upcoming`;
      const firstUpcoming = todayDoses.find((d) => d.status === 'upcoming');
      heroSub = firstUpcoming ? `Next at ${to12h(firstUpcoming.timeOfDay)}` : 'Doses scheduled for later';
    }
  }

  return (
    <div className="space-y-4">
      <PatientCard />

      {/* Status hero */}
      <div className={`bg-gradient-to-br ${heroColor} rounded-2xl p-5 text-white shadow-lg`}>
        <p className="font-display text-2xl">{heroLabel}</p>
        <p className="text-sm text-white/80 mt-1">{heroSub}</p>
      </div>

      {/* Generate Today Button */}
      <button
        id="generate-today-btn"
        onClick={handleGenerate}
        disabled={generating}
        className="w-full py-3 text-sm font-medium rounded-xl transition-all shadow-sm bg-sage-500 hover:bg-sage-600 text-white active:scale-[0.98] disabled:opacity-50"
      >
        {generating ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Generating…
          </span>
        ) : (
          '⚡ Generate Today\'s Doses'
        )}
      </button>
      {genMessage && (
        <p className="text-xs text-center text-sage-600 -mt-2 animate-fadeIn">{genMessage}</p>
      )}

      {/* Today's Doses */}
      <div>
        <h3 className="font-display text-base text-gray-900 mb-2 px-1">Today's Doses</h3>
        <div className="space-y-2">
          {todayDoses.map((dose) => {
            const chip = statusChip(dose.status);
            return (
              <div
                key={dose.id}
                className="flex items-center justify-between py-3 px-4 bg-white rounded-xl border border-cream-200 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-sage-50 flex items-center justify-center">
                    <PillIcon className="w-4 h-4 text-sage-500" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{dose.medicationName}</p>
                    <p className="text-xs text-gray-400">
                      {dose.dose ? `${dose.dose} · ` : ''}{to12h(dose.timeOfDay)}
                    </p>
                  </div>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${chip.cls}`}>
                  {chip.label}
                </span>
              </div>
            );
          })}
          {todayDoses.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">No doses scheduled today</p>
              <p className="text-xs text-gray-300 mt-1">Tap "Generate Today's Doses" if you have schedules</p>
            </div>
          )}
        </div>
      </div>

      {/* Streak */}
      <StreakWidget weekMedicines={weekMedicines} />
    </div>
  );
}

function PillIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.5 1.5l-8.5 8.5a4.95 4.95 0 0 0 7 7l8.5-8.5a4.95 4.95 0 0 0-7-7z" />
      <line x1="8" y1="8" x2="16" y2="16" />
    </svg>
  );
}
