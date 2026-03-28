// Dashboard page — main view with patient card, status hero, dose list, and streak.

import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { getEvents, getTodayStatus, type TodayDose } from '../api/client';
import PatientCard from '../components/PatientCard';
import StreakWidget from '../components/StreakWidget';

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
    case 'pending':
      return { label: 'Pending', cls: 'bg-amber-50 text-amber-600' };
    case 'due':
      return { label: 'Overdue', cls: 'bg-danger-50 text-danger-500' };
    case 'upcoming':
    default:
      return { label: 'Upcoming', cls: 'bg-sky-50 text-sky-600' };
  }
}

export default function Dashboard() {
  const weekEvents = useStore((s) => s.weekEvents);
  const todayDoses = useStore((s) => s.todayDoses);
  const setWeekEvents = useStore((s) => s.setWeekEvents);
  const setTodayDoses = useStore((s) => s.setTodayDoses);

  useEffect(() => {
    getEvents(7).then(setWeekEvents).catch(console.error);
    getTodayStatus().then(setTodayDoses).catch(console.error);
  }, [setWeekEvents, setTodayDoses]);

  // Status hero card — derived from todayDoses (schedule-aware).
  const totalDoses = todayDoses.length;
  const completedDoses = todayDoses.filter((d) => d.status === 'completed').length;
  const missedDoses = todayDoses.filter((d) => d.status === 'missed').length;
  const pendingDoses = todayDoses.filter((d) => d.status === 'pending').length;
  const dueDoses = todayDoses.filter((d) => d.status === 'due').length;
  const upcomingDoses = todayDoses.filter((d) => d.status === 'upcoming').length;

  let heroColor = 'from-sage-500 to-sage-600';
  let heroLabel = 'All clear';
  let heroSub = 'No medications scheduled today';

  if (totalDoses > 0) {
    if (missedDoses > 0) {
      heroColor = 'from-danger-400 to-danger-500';
      heroLabel = `${missedDoses} Missed`;
      heroSub = 'Please check on Margaret';
    } else if (dueDoses > 0) {
      heroColor = 'from-amber-400 to-amber-500';
      heroLabel = `${dueDoses} Overdue`;
      heroSub = 'Doses past their scheduled time';
    } else if (pendingDoses > 0) {
      heroColor = 'from-amber-400 to-amber-500';
      heroLabel = `${pendingDoses} Pending`;
      heroSub = 'Waiting for confirmation';
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
      <div className={`bg-gradient-to-br ${heroColor} rounded-2xl p-5 text-white shadow-md`}>
        <p className="font-display text-2xl">{heroLabel}</p>
        <p className="text-sm text-white/80 mt-1">{heroSub}</p>
      </div>

      {/* Today's Doses */}
      <div>
        <h3 className="font-display text-base text-gray-900 mb-2 px-1">Today's Doses</h3>
        <div className="space-y-2">
          {todayDoses.map((dose) => {
            const chip = statusChip(dose.status);
            return (
              <div
                key={`${dose.scheduleId}-${dose.timeOfDay}`}
                className="flex items-center justify-between py-3 px-4 bg-white rounded-xl border border-cream-200 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-sage-50 flex items-center justify-center">
                    <PillIcon className="w-4 h-4 text-sage-500" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{dose.medicationName}</p>
                    <p className="text-xs text-gray-400">
                      {dose.dose} · {to12h(dose.timeOfDay)}
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
            <p className="text-sm text-gray-400 text-center py-6">No doses scheduled today</p>
          )}
        </div>
      </div>

      {/* Streak */}
      <StreakWidget weekEvents={weekEvents} />
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

