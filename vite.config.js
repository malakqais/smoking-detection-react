import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const FLASK = 'http://127.0.0.1:5000';

function forwardClientIp(proxy) {
  proxy.on('error', (err) => {
    console.log('proxy error', err);
  });
  proxy.on('proxyReq', (proxyReq, req) => {
    const clientIp =
      req.headers['x-forwarded-for'] ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    proxyReq.setHeader('X-Forwarded-For', String(clientIp).split(',')[0].trim());
    console.log('Sending Request to the Target:', req.method, req.url);
  });
  proxy.on('proxyRes', (proxyRes, req) => {
    console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
  });
}

/** SPA routes share names with Flask auth POST paths — only proxy non-GET. */
function spaSafeAuthProxy(path) {
  return {
    target: FLASK,
    changeOrigin: true,
    secure: false,
    configure: forwardClientIp,
    bypass(req) {
      if (req.method === 'GET' || req.method === 'HEAD') {
        return '/index.html';
      }
    },
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: FLASK,
        changeOrigin: true,
        secure: false,
        configure: forwardClientIp,
      },
      '/static': {
        target: FLASK,
        changeOrigin: true,
        secure: false,
      },
      '/login/2fa': {
        target: FLASK,
        changeOrigin: true,
        secure: false,
        configure: forwardClientIp,
      },
      '^/login$': spaSafeAuthProxy('/login'),
      '^/signup$': spaSafeAuthProxy('/signup'),
    },
  },
});
