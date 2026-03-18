// MedRow — a single medication with today's dose status chip.

import type { MedEvent } from '../api/client';

interface Props {
  name: string;
  dose: string;
  events: MedEvent[];
}

export default function MedRow({ name, dose, events }: Props) {
  // Determine today's aggregate status from events.
  const hasMissed = events.some((e) => e.status === 'missed');
  const hasPending = events.some((e) => e.status === 'pending');
  const allCompleted = events.length > 0 && events.every((e) => e.status === 'completed');

  let chipLabel = 'Scheduled';
  let chipClass = 'bg-gray-100 text-gray-500';

  if (allCompleted) {
    chipLabel = 'Taken';
    chipClass = 'bg-sage-50 text-sage-600';
  } else if (hasMissed) {
    chipLabel = 'Missed';
    chipClass = 'bg-danger-50 text-danger-500';
  } else if (hasPending) {
    chipLabel = 'Pending';
    chipClass = 'bg-amber-50 text-amber-600';
  }

  return (
    <div className="flex items-center justify-between py-3 px-4 bg-white rounded-xl border border-cream-200 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-sage-50 flex items-center justify-center">
          <PillIcon className="w-4 h-4 text-sage-500" />
        </div>
        <div>
          <p className="font-medium text-gray-900 text-sm">{name}</p>
          <p className="text-xs text-gray-400">{dose}</p>
        </div>
      </div>

      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${chipClass}`}>
        {chipLabel}
      </span>
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
