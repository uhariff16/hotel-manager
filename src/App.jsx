import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSettingsStore } from './lib/store';
import AppLayout from './layouts/AppLayout';

// Mock empty pages for now
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const CottagesRooms = React.lazy(() => import('./pages/CottagesRooms'));
const Bookings = React.lazy(() => import('./pages/Bookings'));
const CalendarView = React.lazy(() => import('./pages/CalendarView'));
const Financials = React.lazy(() => import('./pages/Financials'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Reports = React.lazy(() => import('./pages/Reports'));

function App() {
  const { theme } = useSettingsStore();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <BrowserRouter>
      <React.Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="setup" element={<CottagesRooms />} />
            <Route path="bookings" element={<Bookings />} />
            <Route path="calendar" element={<CalendarView />} />
            <Route path="financials" element={<Financials />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </React.Suspense>
    </BrowserRouter>
  );
}

export default App;
