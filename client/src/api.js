import axios from 'axios';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('facetrack:unauthorized'));
    }
    const apiError = new Error(error.response?.data?.error?.message || 'Something went wrong');
    apiError.code = error.response?.data?.error?.code;
    apiError.status = error.response?.status;
    apiError.details = error.response?.data?.error?.details;
    return Promise.reject(apiError);
  },
);
