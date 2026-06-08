// RoomMonitor — live room environment card showing temperature and humidity.
// Reads from room_monitoring table via Supabase Realtime (live updates every 30s).

import { useStore } from '../store/useStore';

/** Format "ago" text from ISO timestamp */
function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export default function RoomMonitor() {
  const roomData = useStore((s) => s.roomData);

  // No data yet — show empty state
  if (!roomData) {
    return (
      <div className="bg-white/70 backdrop-blur-md rounded-2xl p-5 shadow-sm border border-cream-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-sky-50 flex items-center justify-center">
            <AirIcon className="w-4 h-4 text-sky-500" />
          </div>
          <h3 className="font-display text-base text-gray-900">Room Environment</h3>
        </div>
        <div className="text-center py-4">
          <p className="text-sm text-gray-400">Waiting for sensor data…</p>
          <p className="text-xs text-gray-300 mt-1">ESP32 will start sending readings once connected</p>
        </div>
      </div>
    );
  }

  const ago = timeAgo(roomData.created_at);

  return (
    <div className="bg-white/70 backdrop-blur-md rounded-2xl p-5 shadow-sm border border-cream-200 transition-all hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sky-50 flex items-center justify-center">
            <AirIcon className="w-4 h-4 text-sky-500" />
          </div>
          <h3 className="font-display text-base text-gray-900">Room Environment</h3>
        </div>
      </div>

      {/* Temperature & Humidity */}
      <div className="grid grid-cols-2 gap-3">
        {/* Temperature */}
        <div className="bg-gradient-to-br from-orange-50 to-amber-50/50 rounded-xl p-3.5 border border-orange-100/50">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ThermIcon className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider">Temp</span>
          </div>
          <div className="flex items-baseline gap-0.5">
            <span className="font-display text-2xl text-gray-900">
              {roomData.temperature !== null ? roomData.temperature.toFixed(1) : '--'}
            </span>
            <span className="text-xs text-gray-400">°C</span>
          </div>
          {roomData.temperature !== null && (
            <div className="mt-1.5">
              <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.min(100, Math.max(0, ((roomData.temperature - 10) / 40) * 100))}%`,
                    background: roomData.temperature < 20 ? '#3b82f6' : roomData.temperature < 30 ? '#10b981' : roomData.temperature < 38 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Humidity */}
        <div className="bg-gradient-to-br from-blue-50 to-sky-50/50 rounded-xl p-3.5 border border-blue-100/50">
          <div className="flex items-center gap-1.5 mb-1.5">
            <DropletIcon className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Humidity</span>
          </div>
          <div className="flex items-baseline gap-0.5">
            <span className="font-display text-2xl text-gray-900">
              {roomData.humidity !== null ? roomData.humidity.toFixed(1) : '--'}
            </span>
            <span className="text-xs text-gray-400">%</span>
          </div>
          {roomData.humidity !== null && (
            <div className="mt-1.5">
              <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.min(100, roomData.humidity)}%`,
                    background: roomData.humidity < 30 ? '#f59e0b' : roomData.humidity < 60 ? '#10b981' : '#3b82f6',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer — last updated */}
      <div className="flex items-center justify-center gap-1.5 mt-3 pt-3 border-t border-cream-100">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[11px] text-gray-400">
          Live · updated {ago}
        </span>
      </div>
    </div>
  );
}


// ─── Inline SVG Icons ───────────────────────────────────────────────────────

function AirIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.59 4.59A2 2 0 1 1 11 8H2" />
      <path d="M12.59 19.41A2 2 0 1 0 14 16H2" />
      <path d="M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2" />
    </svg>
  );
}

function ThermIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </svg>
  );
}

function DropletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  );
}
