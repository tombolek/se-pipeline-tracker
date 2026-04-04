import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import PipelinePage from './pages/PipelinePage';
import ClosedLostPage from './pages/ClosedLostPage';
import MyTasksPage from './pages/MyTasksPage';
import InsightsPage from './pages/InsightsPage';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import QuickCapture from './components/QuickCapture';
import SettingsPage from './pages/SettingsPage';
import { useAuthStore } from './store/auth';
import { usePipelineStore } from './store/pipeline';

function AppShell({ children }: { children: React.ReactNode }) {
  const openQuickCapture = usePipelineStore((s) => s.openQuickCapture);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openQuickCapture();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openQuickCapture]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {children}
      </main>
      <QuickCapture />
    </div>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#F5F5F7]">
      <div className="text-center">
        <p className="text-lg font-semibold text-brand-navy">{title}</p>
        <p className="text-sm text-brand-navy-70 mt-1">Coming soon</p>
      </div>
    </div>
  );
}

function AuthInit({ children }: { children: React.ReactNode }) {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  useEffect(() => { checkAuth(); }, [checkAuth]);
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthInit>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell><Navigate to="/pipeline" /></AppShell>} path="/" />
            <Route path="/pipeline" element={<AppShell><PipelinePage /></AppShell>} />
            <Route path="/closed-lost" element={<AppShell><ClosedLostPage /></AppShell>} />
            <Route path="/my-tasks" element={<AppShell><MyTasksPage /></AppShell>} />
            <Route path="/inbox" element={<Navigate to="/my-tasks" replace />} />
            <Route path="/insights/*" element={<AppShell><InsightsPage /></AppShell>} />
            <Route path="/settings/*" element={<AppShell><SettingsPage /></AppShell>} />
            <Route path="/" element={<Navigate to="/pipeline" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthInit>
    </BrowserRouter>
  );
}
