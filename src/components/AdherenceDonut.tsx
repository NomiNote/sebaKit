// AdherenceDonut — SVG donut chart showing weekly medication adherence %.
// Adapted to use Medicine[] from Supabase.

import type { Medicine } from '../lib/database.types';

interface Props {
  weekMedicines: Medicine[];
}

export default function AdherenceDonut({ weekMedicines }: Props) {
  // Only count medicines with a definitive status (exclude today's pending/upcoming)
  const resolved = weekMedicines.filter((m) => m.status === 'taken' || m.status === 'missed');
  const total = resolved.length;
  const taken = resolved.filter((m) => m.status === 'taken').length;
  const pct = total > 0 ? Math.round((taken / total) * 100) : 0;

  // SVG circle geometry.
  const r = 54;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;

  // Color based on adherence level.
  let strokeColor = '#4a7c59'; // sage
  if (pct < 50) strokeColor = '#d95f4b'; // red
  else if (pct < 80) strokeColor = '#e8972a'; // amber

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-cream-200 flex flex-col items-center">
      <h3 className="font-display text-base text-gray-900 mb-1">This Week</h3>
      <p className="text-xs text-gray-400 mb-4">
        {taken} of {total} doses taken
      </p>

      <div className="relative w-32 h-32">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          {/* Background ring */}
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="#e8e4dc"
            strokeWidth="10"
          />
          {/* Filled arc */}
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circ - filled}`}
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl text-gray-900">{pct}%</span>
          <span className="text-[10px] text-gray-400 -mt-0.5">adherence</span>
        </div>
      </div>
    </div>
  );
}
