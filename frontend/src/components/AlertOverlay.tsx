// AlertOverlay — dismissable modal popup that shows when a medication reminder triggers.
// Renders over any page. Auto-dismisses on ack (completed/missed). Can be manually dismissed.

import { useStore } from '../store/useStore';

export default function AlertOverlay() {
  const activeAlert = useStore((s) => s.activeAlert);
  const clearAlert = useStore((s) => s.clearAlert);

  if (!activeAlert) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-[320px] p-6 relative animate-slideUp">
        {/* Dismiss button */}
        <button
          onClick={clearAlert}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
          aria-label="Dismiss alert"
        >
          <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Pulsing icon */}
        <div className="flex justify-center mb-5">
          <div className="relative">
            <div className="absolute inset-0 w-20 h-20 rounded-full bg-amber-400/20 animate-ping" />
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-lg shadow-amber-200/50">
              <PillBoxIcon className="w-9 h-9 text-white" />
            </div>
          </div>
        </div>

        {/* Content */}
        <h2 className="font-display text-xl text-gray-900 text-center mb-1">
          {activeAlert.medicationName}
        </h2>
        <p className="text-sm text-gray-500 text-center mb-4">
          Medication reminder triggered
        </p>

        <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 rounded-xl">
          <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
          <span className="text-sm text-amber-700 font-medium">
            Waiting for patient to open box…
          </span>
        </div>

        <p className="text-[11px] text-gray-400 text-center mt-4 leading-relaxed">
          Auto-dismisses when the device confirms.
          <br />
          Tap ✕ to close this popup — it won't affect the reminder.
        </p>
      </div>
    </div>
  );
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function PillBoxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M4 10h16" />
      <path d="M9 6V4" />
      <path d="M15 6V4" />
      <path d="M12 14v2" />
      <path d="M11 15h2" />
    </svg>
  );
}
