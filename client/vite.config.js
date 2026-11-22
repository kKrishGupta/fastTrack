import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4000';

  return {
    plugins: [react()],
    resolve: {
      // Keep every workspace dependency on the same React hook dispatcher.
      dedupe: ['react', 'react-dom'],
    },
    server: {
      proxy: {
        '/api': proxyTarget,
        '/socket.io': {
          target: proxyTarget,
          ws: true,
        },
      },
    },
    test: {
      pool: 'threads',
      testTimeout: 20000,
    },
  };
});
