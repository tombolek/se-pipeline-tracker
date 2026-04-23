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
import AppHeader from './components/AppHeader';
import QuickCapture from './components/QuickCapture';
import QuickSwitcher from './components/QuickSwitcher';
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage';
import ReviewOfflineChangesPage from './pages/ReviewOfflineChangesPage';
import ProcessCallNotesPage from './pages/ProcessCallNotesPage';
import { useAuthStore } from './store/auth';
import { usePipelineStore } from './store/pipeline';
import { usePageTracking } from './hooks/useTracking';
import OfflineBanner from './components/OfflineBanner';
import OfflineSimBadge from './components/OfflineSimBadge';
import ReconnectToast from './components/ReconnectToast';
import { requestPersistentStorage } from './offline/db';
import { runFlush } from './offline/flushHandler';
import { startHeartbeat } from './offline/heartbeat';
import { useTheme } from './hooks/useTheme';

function AppShell({ children }: { children: React.ReactNode }) {
  const openQuickCapture  = usePipelineStore((s) => s.openQuickCapture);
  const openQuickSwitcher = usePipelineStore((s) => s.openQuickSwitcher);
  const user = useAuthStore((s) => s.user);
  usePageTracking();
  // Reconcile the .dark class with the user's theme preference on every
  // auth change + system prefers-color-scheme flip. (#138 Chunk A)
  useTheme();

  // Ctrl/Cmd+K         → Quick Switcher (global opportunity search)
  // Ctrl/Cmd+Shift+K   → Quick Capture  (new note/task — viewers skip)
  // We check `shiftKey` first so the switcher never hijacks the capture chord.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      if (e.shiftKey) {
        if (user?.role === 'viewer') return;
        openQuickCapture();
      } else {
        openQuickSwitcher();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openQuickCapture, openQuickSwitcher, user]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <AppHeader />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <OfflineBanner />
          {children}
        </main>
      </div>
      <QuickCapture />
      <QuickSwitcher />
      <ReconnectToast />
    </div>
  );
}


function AuthInit({ children }: { children: React.ReactNode }) {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  useEffect(() => {
    // Check auth first, then start the 45-second offline heartbeat
    // (Phase 3.1). The ping endpoint is unauthenticated so it's fine to
    // start even if checkAuth ends with user=null (e.g. on /login) — the
    // indicator still reflects real network state in that case.
    void (async () => {
      await checkAuth();
      startHeartbeat();
    })();
    // Ask the browser to not evict our IDB cache under disk pressure.
    // No-op on unsupported browsers; silent if already persistent.
    void requestPersistentStorage();
    // Drain any writes queued in a previous session. Safe when the queue
    // is empty; safe if we're still offline (flush will fail transiently
    // and leave everything intact).
    void runFlush();
  }, [checkAuth]);
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Rendered outside AuthInit/Routes so it's also visible on the login
          page — otherwise a user who turns sim on, logs out, and lands back
          at /login has no way to disable it without devtools. */}
      <OfflineSimBadge />
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
            {/* /audit lives under People hub now; keep the old URL as a redirect for bookmarks + audit-log back-refs. */}
            <Route path="/audit" element={<Navigate to="/settings/people/audit" replace />} />
            <Route path="/review-offline-changes" element={<AppShell><ReviewOfflineChangesPage /></AppShell>} />
            <Route path="/opportunities/:sfid/process-notes" element={<AppShell><ProcessCallNotesPage /></AppShell>} />
            <Route path="/" element={<Navigate to="/home" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthInit>
    </BrowserRouter>
  );
}
