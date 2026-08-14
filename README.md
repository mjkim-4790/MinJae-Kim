# 실시간 참여형 레크레이션 웹

모든 작업의 기준 문서: [레크레이션웹_전체구조_설계문서_1.md](레크레이션웹_전체구조_설계문서_1.md)

현재 진행 상태: **Phase 1 — 이벤트/입장 시스템 완료**

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
5173 하나만 열면 된다. 서버 DB(`server/data/recreation.sqlite`)와 업로드 파일
(`server/uploads/`)은 최초 실행 시 자동 생성된다.

### 운영자(MC) 계정 만들기

§9 결정에 따라 가입 기능 없이 개발자가 직접 생성한다.

```bash
node server/scripts/create-operator.mjs --email mc@example.com --name "홍길동"
```

`--password` 를 생략하면 임시 비밀번호를 생성해 출력해준다. 로그인은 `/operator/login`.

### 스마트폰으로 같이 테스트할 때

`npm run dev` 실행 시 터미널에 표시되는 `Network:` 주소(예: `http://192.168.0.10:5173`)로
같은 Wi-Fi 의 폰에서 접속한다. 서버 CORS 는 `server/.env` 의 `CORS_ORIGINS` 에
같은 주소를 추가한다 (`server/.env.example` 참고).

### 운영 빌드 (단일 서비스)

```bash
npm run build && npm start
```

`client/dist` 가 있으면 서버가 클라이언트까지 함께 서빙한다 (무료 티어 단일 서비스 배포용).
운영 환경에서는 `server/.env` 에 `SESSION_SECRET` 을 반드시 별도로 지정한다
(`.env.example` 의 기본값은 개발용).

---

## 3화면 주소 (설계문서 §3.1)

| 화면 | 주소 | 설명 |
|---|---|---|
| 운영자 | `/operator` (로그인 필요) | MC 컨트롤러. 스크린에 미러링 금지 |
| 참여자 | `/join/:code` | QR 스캔 시 바로 열리는 주소 |
| 대형 스크린 | `/screen/:code` | 조작 없는 표시 전용, 전체화면으로 사용 |
| 홈 | `/` | 참여 코드 4자리 입력 (QR 백업 경로) |

---

## 폴더 구조

```
├── server/                  Node + Express + Socket.IO
│   ├── scripts/
│   │   └── create-operator.mjs   MC 계정 생성 CLI
│   ├── data/                 SQLite 파일 (gitignore)
│   ├── uploads/              로고 업로드 파일 (gitignore)
│   └── src/
│       ├── index.js          부트스트랩 (HTTP + Socket.IO)
│       ├── app.js             Express 앱 · 세션 · 라우터 마운트
│       ├── config.js          환경 변수
│       ├── uploads.js         로고 업로드(multer) 설정
│       ├── auth/
│       │   ├── password.js    bcrypt 해시
│       │   ├── session.js     express-session 설정
│       │   └── middleware.js  requireOperator
│       ├── db/
│       │   ├── schema.sql     operators/events/participants/game_records
│       │   ├── index.js       better-sqlite3 연결 + 마이그레이션
│       │   ├── operators.js
│       │   ├── events.js      4자리 코드 발급 포함
│       │   └── participants.js
│       ├── routes/
│       │   ├── auth.js        로그인/로그아웃/me
│       │   └── events.js      이벤트 CRUD·이력
│       └── realtime/
│           ├── index.js       소켓 연결 처리, 접속 현황 브로드캐스트
│           ├── rooms.js       룸 이름 규칙 (event:CODE:role)
│           └── players.js     참여자 입장/재접속/중복접속 처리
└── client/                  React + Vite + Socket.IO Client
    └── src/
        ├── App.jsx           3화면 라우팅 (운영자는 중첩 라우트)
        ├── lib/{api,socket}.js
        ├── hooks/
        │   ├── useAuth.jsx            운영자 로그인 상태 컨텍스트
        │   ├── useRealtimeSession.js  역할별 룸 접속 + presence
        │   └── usePlayerConnection.js 참여자 입장/자동 재접속
        ├── components/        StatusBar, QrCode, RequireOperator
        └── routes/
            ├── Home.jsx
            ├── operator/       Login, Events(목록), NewEvent, EventDetail
            ├── player/         PlayerJoin (프로필 설정 + 대기화면)
            └── screen/         ScreenView (QR/코드 대기화면)
```

### 룸 규칙 (설계문서 §3.2)

```
event:1234            이벤트 전체
event:1234:operator   운영자 전용
event:1234:player     참여자 전용
event:1234:screen     스크린 전용
```

이벤트 코드가 없으면 `LOBBY` 룸으로 처리한다.

### 참여자 재접속 (설계문서 §4.3, §7-1·2)

- 식별키 = 닉네임 + 숫자 4자리. `player:join` 소켓 이벤트로 입장/재접속 모두 처리.
- 브라우저에 `localStorage` 로 마지막 신원을 저장해두고, 페이지를 새로고침해도
  자동으로 같은 신원으로 재입장을 시도한다 (실패하면 입력 폼으로 대체).
- 같은 신원으로 다른 기기가 접속하면 이전 소켓은 `player:kicked` 를 받고 끊긴다
  (한 사람 = 한 연결).
- 종료된 이벤트 코드로는 재입장이 거부된다 (`EVENT_NOT_FOUND`).

---

## Phase 0 에서 확인된 것

- [x] 서버 기동 + `/api/health` 응답
- [x] 3화면 라우팅
- [x] 운영자·참여자·스크린이 같은 이벤트 룸에 접속, 역할별 룸 분리
- [x] 접속/이탈 시 접속 현황(`presence:update`) 브로드캐스트
- [x] 운영 빌드 단일 서비스 서빙 + SPA 라우팅 폴백

## Phase 1 에서 확인된 것

- [x] MC 계정 생성 CLI + bcrypt 해시 + 세션 로그인/로그아웃
- [x] 이벤트 개설(이름/모드/인원/일시/로고) · 리스트 · 상세 · 진행 시작/종료
- [x] 진행 중이 아닌 이벤트끼리 겹치지 않는 4자리 코드 자동 발급(충돌 시 재시도)
- [x] 참여 QR 코드 생성 (운영자 상세 화면 + 대형 스크린)
- [x] 참여자 입장(닉네임+숫자4자리), 정원 초과/잘못된 코드 처리
- [x] 재접속 시 점수/상태 복원, 중복 접속 시 이전 연결 강제 종료
- [x] 운영자별 이벤트 소유권 분리(다른 MC의 이벤트는 404)
- [x] 브라우저 E2E 확인: 로그인 → 이벤트 생성 → QR 표시 → 참여자 입장 →
      실시간 접속 현황 갱신 → 새로고침 재접속 복구 → 종료 → 이력 조회

## 다음 (Phase 2 — 실시간 기반)

룸 구조 위에 실시간 메시지(상단고정/자동스크롤), 스크린 대기화면 로고 표시,
참여자 목록 실시간 푸시(현재는 수동 새로고침) 추가.
