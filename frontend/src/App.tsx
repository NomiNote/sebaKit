// App.tsx — root layout with routing and WebSocket connection.

import { useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useWebSocket } from './hooks/useWebSocket';
import { useStore } from './store/useStore';
import BottomNav from './components/BottomNav';
import Dashboard from './pages/Dashboard';
import SchedulePage from './pages/Schedule';
import AlertPage from './pages/Alert';
import HistoryPage from './pages/History';

export default function App() {
  useWebSocket();

  const activeAlert = useStore((s) => s.activeAlert);
  const navigate = useNavigate();

  // Auto-navigate to Alert page when a trigger fires.
  useEffect(() => {
    if (activeAlert) {
      navigate('/alert');
    }
  }, [activeAlert, navigate]);

  return (
    <div className="mx-auto max-w-[360px] min-h-screen pb-16 px-4 pt-6">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/alert" element={<AlertPage />} />
        <Route path="/history" element={<HistoryPage />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
