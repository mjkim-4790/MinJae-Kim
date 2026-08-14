# 실시간 참여형 레크레이션 웹

모든 작업의 기준 문서: [레크레이션웹_전체구조_설계문서_1.md](레크레이션웹_전체구조_설계문서_1.md)

현재 진행 상태: **Phase 0 — 프로젝트 뼈대 완료**

---

## 실행 방법

```bash
npm install
```

```bash
npm run dev
```

- 클라이언트: http://localhost:5173
- 서버: http://localhost:4000 (헬스 체크 `GET /api/health`)

Vite 개발 서버가 `/api` 와 `/socket.io` 를 4000 포트로 프록시하므로, 브라우저에서는
5173 하나만 열면 된다.

### 스마트폰으로 같이 테스트할 때

`npm run dev` 실행 시 터미널에 표시되는 `Network:` 주소(예: `http://192.168.0.10:5173`)로
같은 Wi-Fi 의 폰에서 접속한다. 서버 CORS 는 `server/.env` 의 `CORS_ORIGINS` 에
같은 주소를 추가한다 (`server/.env.example` 참고).

### 운영 빌드 (단일 서비스)

```bash
npm run build && npm start
```

`client/dist` 가 있으면 서버가 클라이언트까지 함께 서빙한다 (무료 티어 단일 서비스 배포용).

---

## 3화면 주소 (설계문서 §3.1)

| 화면 | 주소 | 설명 |
|---|---|---|
| 운영자 | `/operator` | MC 컨트롤러. 스크린에 미러링 금지 |
| 참여자 | `/join/:code` | QR 스캔 시 바로 열리는 주소 |
| 대형 스크린 | `/screen/:code` | 조작 없는 표시 전용, 전체화면으로 사용 |
| 홈 | `/` | 참여 코드 4자리 입력 (QR 백업 경로) |

---

## 폴더 구조

```
├── server/                  Node + Express + Socket.IO
│   └── src/
│       ├── index.js         부트스트랩 (HTTP + Socket.IO)
│       ├── app.js           Express 앱 · /api/health · 운영 빌드 서빙
│       ├── config.js        환경 변수
│       └── realtime/
│           ├── index.js     소켓 연결 처리, 접속 현황 브로드캐스트
│           └── rooms.js     룸 이름 규칙 (event:CODE:role)
└── client/                  React + Vite + Socket.IO Client
    └── src/
        ├── App.jsx          3화면 라우팅
        ├── lib/socket.js    앱 전체가 공유하는 소켓 (자동 재연결)
        ├── hooks/           useRealtimeSession — 룸 접속 + 상태
        ├── components/      StatusBar (연결 상태 표시)
        └── routes/          Home / operator / player / screen
```

### 룸 규칙 (설계문서 §3.2)

```
event:1234            이벤트 전체
event:1234:operator   운영자 전용
event:1234:player     참여자 전용
event:1234:screen     스크린 전용
```

이벤트 코드가 없으면 `LOBBY` 룸으로 처리한다 (Phase 1 에서 실제 코드 발급).

---

## Phase 0 에서 확인된 것

- [x] 서버 기동 + `/api/health` 응답
- [x] 3화면 라우팅 (`/`, `/operator`, `/join/:code`, `/screen/:code`)
- [x] 운영자·참여자·스크린이 같은 이벤트 룸에 접속, 역할별 룸 분리
- [x] 접속/이탈 시 접속 현황(`presence:update`) 브로드캐스트
- [x] 운영 빌드 단일 서비스 서빙 + SPA 라우팅 폴백

## 다음 (Phase 1 — 이벤트/입장 시스템)

MC 로그인, 이벤트 CRUD·리스트·이력, 4자리 코드 발급, QR 생성,
참여자 입장(닉네임+숫자 4자리), 재접속 복구.
