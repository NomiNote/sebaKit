// BottomNav — mobile bottom tab bar.

import { NavLink } from 'react-router-dom';
import { useStore } from '../store/useStore';

const tabs = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/schedule', label: 'Schedule', icon: CalendarIcon },
  { to: '/history', label: 'History', icon: ClockIcon },
] as const;

export default function BottomNav() {
  const activeAlert = useStore((s) => s.activeAlert);

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[360px] bg-white border-t border-cream-200 shadow-lg z-50">
      <div className="flex justify-around items-center h-14">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 text-[11px] font-medium transition-colors ${
                isActive ? 'text-sage-500' : 'text-gray-400 hover:text-gray-600'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}

        {/* Alert tab — only shows dot when active */}
        <NavLink
          to="/alert"
          className={({ isActive }) =>
            `relative flex flex-col items-center gap-0.5 text-[11px] font-medium transition-colors ${
              isActive ? 'text-amber-500' : activeAlert ? 'text-amber-400' : 'text-gray-400 hover:text-gray-600'
            }`
          }
        >
          {activeAlert && (
            <span className="absolute -top-0.5 right-0 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
          )}
          <BellIcon className="w-5 h-5" />
          Alert
        </NavLink>
      </div>
    </nav>
  );
}

// ─── Inline SVG Icons ───────────────────────────────────────────────────────

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
