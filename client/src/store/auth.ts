import { create } from 'zustand';
import type { User } from '../types';
import { login as apiLogin, logout as apiLogout, getMe } from '../api/auth';
import { getMyRoleAccess } from '../api/settings';

interface AuthState {
  user: User | null;
  token: string | null;
  sessionId: string | null;
  allowedPages: string[];
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User) => void;
  fetchAllowedPages: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  sessionId: sessionStorage.getItem('sessionId'),
  allowedPages: [],
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { token, user } = await apiLogin(email, password);
      const sessionId = crypto.randomUUID();
      localStorage.setItem('token', token);
      sessionStorage.setItem('sessionId', sessionId);
      // Fetch allowed pages after login
      const allowedPages = await getMyRoleAccess().catch(() => [] as string[]);
      set({ token, user, sessionId, allowedPages, isLoading: false });
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
    set({ user: null, token: null, sessionId: null, allowedPages: [] });
  },

  setUser: (user) => set({ user }),

  fetchAllowedPages: async () => {
    const allowedPages = await getMyRoleAccess().catch(() => [] as string[]);
    set({ allowedPages });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) { set({ user: null, token: null, sessionId: null, allowedPages: [], isLoading: false }); return; }
    set({ isLoading: true });
    try {
      const meData = await getMe();
      // If /me returns a fresh token, store it (picks up isAdmin without re-login)
      if (meData.token) {
        localStorage.setItem('token', meData.token);
      }
      const { token: freshToken, ...user } = meData;
      // Fetch allowed pages
      const allowedPages = await getMyRoleAccess().catch(() => [] as string[]);
      // Restore or generate a session ID for page-refresh continuity
      const sessionId = sessionStorage.getItem('sessionId') ?? (() => {
        const id = crypto.randomUUID();
        sessionStorage.setItem('sessionId', id);
        return id;
      })();
      set({ user: user as User, token: freshToken ?? token, sessionId, allowedPages, isLoading: false });
    } catch {
      localStorage.removeItem('token');
      sessionStorage.removeItem('sessionId');
      set({ user: null, token: null, sessionId: null, allowedPages: [], isLoading: false });
    }
  },
}));
