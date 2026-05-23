// StreakWidget — 7-day adherence grid showing taken/missed/today/future circles.
// Adapted to use Medicine[] from Supabase instead of MedEvent[].

import type { Medicine } from '../lib/database.types';

interface Props {
  weekMedicines: Medicine[];
}

export default function StreakWidget({ weekMedicines }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build an array of the last 7 days.
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-cream-200">
      <h3 className="font-display text-base text-gray-900 mb-3">7-Day Streak</h3>
      <div className="flex justify-between">
        {days.map((day, i) => {
          const isToday = day.getTime() === today.getTime();
          const isFuture = day.getTime() > today.getTime();

          // Get medicines for this day (compare by date string).
          const dayStr = day.toLocaleDateString('en-CA'); // "YYYY-MM-DD"
          const dayMeds = weekMedicines.filter((m) => m.date === dayStr);

          let status: 'taken' | 'missed' | 'partial' | 'today' | 'future' | 'none' = 'none';

          if (isFuture) {
            status = 'future';
          } else if (isToday) {
            status = 'today';
            if (dayMeds.length > 0) {
              const hasMissed = dayMeds.some((m) => m.status === 'missed');
              const allTaken = dayMeds.every((m) => m.status === 'taken');
              if (allTaken) status = 'taken';
              else if (hasMissed) status = 'missed';
            }
          } else if (dayMeds.length > 0) {
            const taken = dayMeds.filter((m) => m.status === 'taken').length;
            const total = dayMeds.length;
            if (taken === total) status = 'taken';
            else if (taken === 0) status = 'missed';
            else status = 'partial';
          }

          const colors: Record<string, string> = {
            taken: 'bg-sage-500 text-white shadow-sm shadow-sage-200',
            missed: 'bg-danger-400 text-white shadow-sm shadow-danger-200',
            partial: 'bg-amber-400 text-white shadow-sm shadow-amber-200',
            today: 'bg-sage-100 text-sage-700 ring-2 ring-sage-300',
            future: 'bg-cream-200 text-gray-400',
            none: 'bg-cream-100 text-gray-300',
          };

          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] text-gray-400 font-medium">
                {dayLabels[day.getDay()]}
              </span>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${colors[status]}`}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
