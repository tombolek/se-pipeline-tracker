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
api.interceptors.request.use((config) => {
  if (isOfflineSimEnabled()) {
    markOffline();
    throw new SimulatedOfflineError();
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
api.interceptors.response.use(
  (res) => {
    markOnline();
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
    } else {
      // We reached the server (even if it errored) — we are online.
      markOnline();
    }
    return Promise.reject(error);
  }
);

export default api;
