import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

export default function ProtectedRoute() {
  const { user, token, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    if (token && !user) checkAuth();
  }, [token, user, checkAuth]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] dark:bg-ink-0">
        <div className="w-8 h-8 border-2 border-brand-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token) return <Navigate to="/login" replace />;

  // Force password change before accessing anything else
  if (user?.force_password_change) return <Navigate to="/change-password" replace />;

  return <Outlet />;
}
