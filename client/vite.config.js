import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const SERVER_ORIGIN = 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 같은 Wi-Fi 의 스마트폰에서 접속해 테스트할 수 있도록 LAN 에 노출
    host: true,
    proxy: {
      '/api': { target: SERVER_ORIGIN, changeOrigin: true },
      '/socket.io': { target: SERVER_ORIGIN, ws: true, changeOrigin: true },
    },
  },
});
