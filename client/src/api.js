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
    const responseBody = error.response?.data;
    const providerMessage = typeof responseBody === 'string' ? responseBody.trim() : '';
    const fallbackMessage = !error.response
      ? 'Cannot reach the server. Check your connection and try again.'
      : error.response.status === 429
        ? 'Too many attempts. Please wait before trying again.'
        : error.response.status >= 500
          ? 'The server could not complete this request. Please try again shortly.'
          : 'The request could not be completed.';
    const apiError = new Error(responseBody?.error?.message || providerMessage || fallbackMessage);
    apiError.code = error.response?.data?.error?.code;
    apiError.status = error.response?.status;
    apiError.details = error.response?.data?.error?.details;
    return Promise.reject(apiError);
  },
);
