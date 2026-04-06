import { create } from 'zustand';
import type { User } from '../types';
import { login as apiLogin, logout as apiLogout, getMe } from '../api/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  sessionId: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  sessionId: sessionStorage.getItem('sessionId'),
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { token, user } = await apiLogin(email, password);
      const sessionId = crypto.randomUUID();
      localStorage.setItem('token', token);
      sessionStorage.setItem('sessionId', sessionId);
      set({ token, user, sessionId, isLoading: false });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Login failed. Check your credentials.';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  logout: async () => {
    await apiLogout().catch(() => {});
    localStorage.removeItem('token');
    sessionStorage.removeItem('sessionId');
    set({ user: null, token: null, sessionId: null });
  },

  setUser: (user) => set({ user }),

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) { set({ user: null, token: null, sessionId: null, isLoading: false }); return; }
    set({ isLoading: true });
    try {
      const user = await getMe();
      // Restore or generate a session ID for page-refresh continuity
      const sessionId = sessionStorage.getItem('sessionId') ?? (() => {
        const id = crypto.randomUUID();
        sessionStorage.setItem('sessionId', id);
        return id;
      })();
      set({ user, token, sessionId, isLoading: false });
    } catch {
      localStorage.removeItem('token');
      sessionStorage.removeItem('sessionId');
      set({ user: null, token: null, sessionId: null, isLoading: false });
    }
  },
}));
