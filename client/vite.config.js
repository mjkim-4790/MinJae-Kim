import os from 'node:os';

import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const SERVER_ORIGIN = 'http://localhost:4000';
const PORT = 5173;

// 카메라(getUserMedia)와 기울기 센서는 "보안 컨텍스트"에서만 동작한다.
// http://localhost 는 예외적으로 보안 컨텍스트로 쳐주지만, 폰이 접속하는
// http://192.168.x.x 는 아니다. 그래서 폰으로 카메라/센서 게임을 테스트하려면
// 개발 서버에도 HTTPS 가 필요하다.
//
// 다만 기본으로 켜면 노트북에서 열 때마다 자체서명 인증서 경고를 넘겨야 하고,
// localhost 는 어차피 HTTPS 없이도 카메라가 되므로 필요할 때만 켠다:
//
//   HTTPS=1 npm run dev
//
// 폰에서는 처음 한 번 "안전하지 않음" 경고를 지나야 한다 (자체서명이라 정상).
const useHttps = process.env.HTTPS === '1' || process.env.HTTPS === 'true';

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
  // QR 의 프로토콜은 개발 서버가 실제로 쓰는 것과 같아야 한다. http QR 을 찍고 들어온
  // 폰은 https 서버에 닿지 못한다.
  const scheme = useHttps ? 'https' : 'http';

  return {
    plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
    define: {
      __DEV_LAN_ORIGIN__: JSON.stringify(lan ? `${scheme}://${lan}:${PORT}` : null),
    },
    server: {
      port: PORT,
      // 같은 Wi-Fi 의 스마트폰에서 접속해 테스트할 수 있도록 LAN 에 노출
      host: true,
      proxy: {
        // 서버로 가는 구간은 같은 기기 안이라 그대로 http 를 쓴다
        '/api': { target: SERVER_ORIGIN, changeOrigin: true },
        '/socket.io': { target: SERVER_ORIGIN, ws: true, changeOrigin: true },
      },
    },
  };
});
