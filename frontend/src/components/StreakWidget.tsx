// StreakWidget — 7-day adherence grid showing taken/missed/today/future circles.

import type { MedEvent } from '../api/client';

interface Props {
  weekEvents: MedEvent[];
}

export default function StreakWidget({ weekEvents }: Props) {
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

          // Get events for this day.
          const dayEvents = weekEvents.filter((e) => {
            const eDate = new Date(e.scheduledAt);
            eDate.setHours(0, 0, 0, 0);
            return eDate.getTime() === day.getTime();
          });

          let status: 'taken' | 'missed' | 'partial' | 'today' | 'future' | 'none' = 'none';

          if (isFuture) {
            status = 'future';
          } else if (isToday) {
            status = 'today';
            if (dayEvents.length > 0) {
              const hasMissed = dayEvents.some((e) => e.status === 'missed');
              const allCompleted = dayEvents.every((e) => e.status === 'completed');
              if (allCompleted) status = 'taken';
              else if (hasMissed) status = 'missed';
            }
          } else if (dayEvents.length > 0) {
            const completed = dayEvents.filter((e) => e.status === 'completed').length;
            const total = dayEvents.length;
            if (completed === total) status = 'taken';
            else if (completed === 0) status = 'missed';
            else status = 'partial';
          }

          const colors: Record<string, string> = {
            taken: 'bg-sage-500 text-white',
            missed: 'bg-danger-400 text-white',
            partial: 'bg-amber-400 text-white',
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
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${colors[status]}`}
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
