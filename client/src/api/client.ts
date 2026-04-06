import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1',
});

// Attach JWT token + session ID to every request
api.interceptors.request.use((config) => {
  const token     = localStorage.getItem('token');
  const sessionId = sessionStorage.getItem('sessionId');
  if (token)     config.headers.Authorization  = `Bearer ${token}`;
  if (sessionId) config.headers['X-Session-Id'] = sessionId;
  return config;
});

// On 401, clear session and redirect to login
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
