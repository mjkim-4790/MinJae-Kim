import os from 'node:os';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const SERVER_ORIGIN = 'http://localhost:4000';
const PORT = 5173;

// 개발 서버를 띄운 노트북의 LAN IP 를 찾는다. 운영자가 localhost 로 열어도 참여 QR 에는
// 이 주소가 들어가야 같은 Wi-Fi 의 스마트폰에서 접속할 수 있다 (localhost 는 폰 자기 자신을 가리킴).
function findLanAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

export default defineConfig(({ command }) => {
  // 개발 서버(vite dev)에서만 주입한다. 운영 빌드에 빌드 머신의 내부 IP 가 박히면 안 된다.
  const lan = command === 'serve' ? findLanAddress() : null;

  return {
    plugins: [react()],
    define: {
      __DEV_LAN_ORIGIN__: JSON.stringify(lan ? `http://${lan}:${PORT}` : null),
    },
    server: {
      port: PORT,
      // 같은 Wi-Fi 의 스마트폰에서 접속해 테스트할 수 있도록 LAN 에 노출
      host: true,
      proxy: {
        '/api': { target: SERVER_ORIGIN, changeOrigin: true },
        '/socket.io': { target: SERVER_ORIGIN, ws: true, changeOrigin: true },
      },
    },
  };
});
