import axios from 'axios';
import { markOnline, markOffline } from '../offline/useConnectionStatus';
import { isOfflineSimEnabled, SimulatedOfflineError } from '../offline/offlineSim';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1',
});

// Attach JWT token + session ID to every request. Also: if the dev offline
// simulation toggle is on (Settings → Developer), short-circuit every request
// with a synthetic Network Error so the offline codepaths exercise end-to-end
// without needing to actually disconnect from the VPN.
//
// EXCEPTION: `/auth/*` calls always go through even when sim is on. Otherwise
// turning sim on and then logging out (or refreshing after token expiry) would
// lock the user out — the login endpoint would be blocked and there'd be no
// way to reach the Developer page to flip sim off. Auth requests are a
// quick, harmless round-trip; they don't meaningfully affect the offline test.
api.interceptors.request.use((config) => {
  const url = config.url ?? '';
  const isAuthCall = url.startsWith('/auth/');
  if (isOfflineSimEnabled()) {
    markOffline();
    if (!isAuthCall) throw new SimulatedOfflineError();
  }
  const token     = localStorage.getItem('token');
  const sessionId = sessionStorage.getItem('sessionId');
  if (token)     config.headers.Authorization  = `Bearer ${token}`;
  if (sessionId) config.headers['X-Session-Id'] = sessionId;
  return config;
});

// On 401, clear session and redirect to login.
// Also feeds the offline detector: any successful response → online;
// any network-level failure (no response at all) → offline. HTTP errors like
// 401/403/500 do NOT flip us offline — the server is clearly reachable.
//
// When the dev sim toggle is on, successful auth round-trips must NOT flip
// the indicator back to Live — the UI should stay purple "Offline" so the
// sim state is consistent.
api.interceptors.response.use(
  (res) => {
    if (!isOfflineSimEnabled()) markOnline();
    return res;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    } else if (!error.response) {
      // No response received at all = network-level failure (off VPN / DNS
      // fail / server down at the network layer).
      markOffline();
    } else if (!isOfflineSimEnabled()) {
      // We reached the server (even if it errored) — we are online.
      markOnline();
    }
    return Promise.reject(error);
  }
);

export default api;
