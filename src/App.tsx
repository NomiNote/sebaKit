// App.tsx — root layout with routing, Supabase Realtime connection, and alert overlay.

import { useSupabaseRealtime } from './hooks/useSupabaseRealtime';
import { Routes, Route } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import AlertOverlay from './components/AlertOverlay';
import Dashboard from './pages/Dashboard';
import SchedulePage from './pages/Schedule';
import HistoryPage from './pages/History';
import SettingsPage from './pages/Settings';
import ReloadPrompt from './components/ReloadPrompt';

export default function App() {
  useSupabaseRealtime();

  return (
    <div className="mx-auto max-w-[420px] min-h-screen pb-16 px-4 pt-6">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
      <BottomNav />
      <ReloadPrompt />
      <AlertOverlay />
    </div>
  );
}
