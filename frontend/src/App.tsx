// App.tsx — root layout with routing and WebSocket connection.

import { useWebSocket } from './hooks/useWebSocket';
import { Routes, Route } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import Dashboard from './pages/Dashboard';
import SchedulePage from './pages/Schedule';
import HistoryPage from './pages/History';
import SettingsPage from './pages/Settings';

export default function App() {
  useWebSocket();

  return (
    <div className="mx-auto max-w-[360px] min-h-screen pb-16 px-4 pt-6">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
