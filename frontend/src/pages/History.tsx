// History page — adherence donut + day-grouped event list with badges.

import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { getEvents } from '../api/client';
import AdherenceDonut from '../components/AdherenceDonut';

export default function HistoryPage() {
  const weekEvents = useStore((s) => s.weekEvents);
  const setWeekEvents = useStore((s) => s.setWeekEvents);

  useEffect(() => {
    getEvents(7).then(setWeekEvents).catch(console.error);
  }, [setWeekEvents]);

  // Group events by date (newest first).
  const grouped = weekEvents.reduce<Record<string, typeof weekEvents>>((acc, e) => {
    const dateKey = new Date(e.scheduledAt).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl text-gray-900">History</h1>

      <AdherenceDonut weekEvents={weekEvents} />

      {Object.entries(grouped).map(([date, events]) => (
        <div key={date}>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
            {date}
          </h3>
          <div className="space-y-2">
            {events.map((ev) => {
              const scheduledTime = new Date(ev.scheduledAt).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              });
              const completedTime = ev.completedAt
                ? new Date(ev.completedAt).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : null;

              return (
                <div
                  key={ev.id}
                  className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-cream-200 shadow-sm"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{ev.medicationName}</p>
                    <div className="flex gap-2 text-xs text-gray-400 mt-0.5">
                      <span>Scheduled {scheduledTime}</span>
                      {completedTime && <span>· Taken {completedTime}</span>}
                    </div>
                  </div>

                  <StatusBadge status={ev.status} confirmedByDevice={ev.confirmedByDevice} />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {weekEvents.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-12">No events in the last 7 days</p>
      )}
    </div>
  );
}

// ─── Status Badge ───────────────────────────────────────────────────────────

function StatusBadge({
  status,
  confirmedByDevice,
}: {
  status: string;
  confirmedByDevice: boolean;
}) {
  if (status === 'completed' && confirmedByDevice) {
    return (
      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">
        Confirmed
      </span>
    );
  }
  if (status === 'completed') {
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
