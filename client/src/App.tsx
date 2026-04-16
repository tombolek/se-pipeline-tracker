import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import PipelinePage from './pages/PipelinePage';
import ClosedLostPage from './pages/ClosedLostPage';
import MyTasksPage from './pages/MyTasksPage';
import InsightsPage from './pages/InsightsPage';
import CalendarPage from './pages/CalendarPage';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import QuickCapture from './components/QuickCapture';
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage';
import AuditPage from './pages/AuditPage';
import { useAuthStore } from './store/auth';
import { usePipelineStore } from './store/pipeline';
import { usePageTracking } from './hooks/useTracking';
import OfflineBanner from './components/OfflineBanner';
import { requestPersistentStorage } from './offline/db';

function AppShell({ children }: { children: React.ReactNode }) {
  const openQuickCapture = usePipelineStore((s) => s.openQuickCapture);
  const user = useAuthStore((s) => s.user);
  usePageTracking();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        if (user?.role === 'viewer') return;
        e.preventDefault();
        openQuickCapture();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openQuickCapture, user]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <OfflineBanner />
        {children}
      </main>
      <QuickCapture />
    </div>
  );
}


function AuthInit({ children }: { children: React.ReactNode }) {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  useEffect(() => {
    checkAuth();
    // Ask the browser to not evict our IDB cache under disk pressure.
    // No-op on unsupported browsers; silent if already persistent.
    void requestPersistentStorage();
  }, [checkAuth]);
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthInit>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/home" element={<AppShell><HomePage /></AppShell>} />
            <Route element={<AppShell><Navigate to="/home" /></AppShell>} path="/" />
            <Route path="/pipeline" element={<AppShell><PipelinePage /></AppShell>} />
            <Route path="/my-pipeline" element={<AppShell><PipelinePage myPipelineMode /></AppShell>} />
            <Route path="/favorites" element={<AppShell><PipelinePage favoritesMode /></AppShell>} />
            <Route path="/closed-lost" element={<AppShell><ClosedLostPage /></AppShell>} />
            <Route path="/my-tasks" element={<AppShell><MyTasksPage /></AppShell>} />
            <Route path="/inbox" element={<Navigate to="/my-tasks" replace />} />
            <Route path="/calendar" element={<AppShell><CalendarPage /></AppShell>} />
            <Route path="/insights/*" element={<AppShell><InsightsPage /></AppShell>} />
            <Route path="/settings/*" element={<AppShell><SettingsPage /></AppShell>} />
            <Route path="/audit"      element={<AppShell><AuditPage /></AppShell>} />
            <Route path="/" element={<Navigate to="/home" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthInit>
    </BrowserRouter>
  );
}
