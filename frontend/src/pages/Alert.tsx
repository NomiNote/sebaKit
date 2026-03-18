// Alert page — auto-navigated when a medication reminder triggers.
// Shows a pulsing animation while waiting for the patient to open the pill box.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';

export default function AlertPage() {
  const activeAlert = useStore((s) => s.activeAlert);
  const navigate = useNavigate();

  // Auto-dismiss: return to dashboard when alert resolves.
  useEffect(() => {
    if (!activeAlert) {
      // Small delay so the user sees the resolution.
      const t = setTimeout(() => navigate('/'), 600);
      return () => clearTimeout(t);
    }
  }, [activeAlert, navigate]);

  if (!activeAlert) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-gray-400 text-sm">
        <div className="w-12 h-12 rounded-full bg-sage-50 flex items-center justify-center mb-3">
          <CheckIcon className="w-6 h-6 text-sage-500" />
        </div>
        <p>No active alerts</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-[65vh]">
      {/* Pulsing ring */}
      <div className="relative mb-8">
        <div className="absolute inset-0 w-28 h-28 rounded-full bg-amber-400/20 animate-pulse_ring" />
        <div className="absolute inset-0 w-28 h-28 rounded-full bg-amber-400/10 animate-pulse_ring" style={{ animationDelay: '0.5s' }} />
        <div className="w-28 h-28 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-lg shadow-amber-200">
          <PillBoxIcon className="w-12 h-12 text-white" />
        </div>
      </div>

      {/* Info */}
      <h1 className="font-display text-2xl text-gray-900 text-center">
        {activeAlert.medicationName}
      </h1>
      <p className="text-sm text-gray-500 mt-2 mb-1">Medication reminder triggered</p>

      <div className="flex items-center gap-2 mt-4 mb-8 px-4 py-2.5 bg-amber-50 rounded-xl">
        <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
        <span className="text-sm text-amber-700 font-medium">
          Waiting for patient to open box…
        </span>
      </div>

      <p className="text-xs text-gray-400 text-center max-w-[240px]">
        The alert will auto-dismiss once the pill box is opened and
        confirmation is received from the device.
      </p>
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
