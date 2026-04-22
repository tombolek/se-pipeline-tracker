import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { updateMyPreferences } from '../api/users';
import type { ThemePreference } from '../types';

/**
 * Theme management for the dark-mode rollout (#138).
 *
 * Pipeline:
 *   1. Source of truth is `user.theme` on the authenticated profile.
 *   2. `light` / `dark` — honour that value directly.
 *      `system` — follow the browser's `prefers-color-scheme` media query.
 *      Anonymous (login page, offline-before-fetch) — fall back to the
 *      latest value cached in localStorage, then `prefers-color-scheme`,
 *      so the login screen doesn't flash the wrong palette.
 *   3. Whatever resolves becomes the **effective theme**; we toggle
 *      `.dark` on `<html>` so Tailwind's custom `dark` variant resolves.
 *   4. Setting a new preference writes optimistically to auth store,
 *      persists to the server via PATCH /users/me/preferences, and
 *      caches the raw preference in localStorage for the anon fallback.
 *
 * The hook is safe to call from a single place (App root) — reading
 * elsewhere is cheap (no effects, just store subscription).
 */

const STORAGE_KEY = 'pref:theme';

function readCachedPreference(): ThemePreference {
  const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
  return raw === 'dark' || raw === 'system' ? raw : 'light';
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveEffective(pref: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  if (pref === 'dark') return 'dark';
  if (pref === 'light') return 'light';
  return systemDark ? 'dark' : 'light';
}

function applyThemeClass(effective: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.toggle('dark', effective === 'dark');
  root.style.colorScheme = effective;
}

export function useTheme() {
  const user = useAuthStore(s => s.user);
  const setUser = useAuthStore(s => s.setUser);

  const preference: ThemePreference = user?.theme ?? readCachedPreference();

  // Track system preference so `system` reacts to OS-level flips without
  // the user having to toggle anything.
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const effective = useMemo(
    () => resolveEffective(preference, systemDark),
    [preference, systemDark]
  );

  // Apply the `.dark` class whenever the effective theme changes.
  useEffect(() => {
    applyThemeClass(effective);
  }, [effective]);

  // Keep localStorage warm so the next page load picks the right palette
  // before user profile loads (prevents a light→dark flash on reload).
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, preference);
  }, [preference]);

  const setTheme = useCallback(async (next: ThemePreference) => {
    // Optimistic local update so the UI flips immediately.
    if (user) {
      setUser({ ...user, theme: next });
    } else {
      // Anonymous: persist locally; server will catch up on next login.
      window.localStorage.setItem(STORAGE_KEY, next);
      applyThemeClass(resolveEffective(next, systemDark));
    }
    if (user) {
      try {
        await updateMyPreferences({ theme: next });
      } catch {
        // Non-fatal — the optimistic update stands; we'll re-sync on next /me.
      }
    }
  }, [user, setUser, systemDark]);

  return { preference, effective, setTheme };
}

/**
 * One-shot sync for the very first paint: pulls the cached pref from
 * localStorage and applies the `.dark` class before React mounts, so the
 * login page + pre-auth renders don't flash in the wrong palette.
 * Imported from main.tsx.
 */
export function applyCachedThemeEagerly() {
  if (typeof window === 'undefined') return;
  const pref = readCachedPreference();
  applyThemeClass(resolveEffective(pref, systemPrefersDark()));
}
