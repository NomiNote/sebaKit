// History page — adherence donut + day-grouped medicine list with status badges.
// Fetches from Supabase `medicines` table (last 7 days).

import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { getWeekMedicines } from '../api/supabase-client';
import AdherenceDonut from '../components/AdherenceDonut';

/** Convert "HH:MM:SS" or "HH:MM" → "h:mm AM/PM" */
function to12h(tod: string): string {
  const [hStr, mStr] = tod.split(':');
  let h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr} ${suffix}`;
}

export default function HistoryPage() {
  const weekMedicines = useStore((s) => s.weekMedicines);
  const setWeekMedicines = useStore((s) => s.setWeekMedicines);

  useEffect(() => {
    getWeekMedicines(7).then(setWeekMedicines).catch(console.error);
  }, [setWeekMedicines]);

  // Group medicines by date (newest first).
  const grouped = weekMedicines.reduce<Record<string, typeof weekMedicines>>((acc, m) => {
    // Format the date string as a readable label
    const dateObj = new Date(m.date + 'T00:00:00');
    const dateKey = dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl text-gray-900">History</h1>

      <AdherenceDonut weekMedicines={weekMedicines} />

      {Object.entries(grouped).map(([date, medicines]) => (
        <div key={date}>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
            {date}
          </h3>
          <div className="space-y-2">
            {medicines.map((med) => {
              const scheduledTime = to12h(med.time);
              const takenTime = med.taken_at
                ? new Date(med.taken_at).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  })
                : null;

              return (
                <div
                  key={med.id}
                  className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-cream-200 shadow-sm transition-all hover:shadow-md"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{med.name}</p>
                    <div className="flex gap-2 text-xs text-gray-400 mt-0.5">
                      <span>Scheduled {scheduledTime}</span>
                      {takenTime && <span>· Taken {takenTime}</span>}
                    </div>
                  </div>

                  <StatusBadge status={med.status} />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {weekMedicines.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-12">No events in the last 7 days</p>
      )}
    </div>
  );
}

// ─── Status Badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'taken') {
    return (
      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-sage-50 text-sage-600">
        Taken
      </span>
    );
  }
  if (status === 'missed') {
    return (
      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-danger-50 text-danger-500">
        Missed
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600">
      Pending
    </span>
  );
}
