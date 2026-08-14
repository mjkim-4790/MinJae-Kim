# 실시간 참여형 레크레이션 웹

모든 작업의 기준 문서: [레크레이션웹_전체구조_설계문서_1.md](레크레이션웹_전체구조_설계문서_1.md)

현재 진행 상태: **Phase 2 — 실시간 기반 완료**

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
│           ├── index.js       소켓 연결 처리, 운영자 세션 인증, 접속 현황 브로드캐스트
│           ├── rooms.js       룸 이름 규칙 (event:CODE:role)
│           ├── authz.js       운영자 권한 액션 검증 (isAuthorizedOperator)
│           ├── players.js     참여자 입장/재접속/중복접속 처리
│           ├── eventState.js  이벤트별 실시간 상태(스크린 모드/채팅/메시지, 메모리)
│           ├── screen.js      스크린 모드 전환(로고 ↔ QR)
│           └── messages.js    실시간 메시지 송출/고정/삭제/채팅토글
└── client/                  React + Vite + Socket.IO Client
    └── src/
        ├── App.jsx           3화면 라우팅 (운영자는 중첩 라우트)
        ├── lib/{api,socket}.js
        ├── hooks/
        │   ├── useAuth.jsx            운영자 로그인 상태 컨텍스트
        │   ├── useRealtimeSession.js  역할별 룸 접속 + presence + 초기 상태
        │   ├── usePlayerConnection.js 참여자 입장/자동 재접속
        │   └── useChat.js             실시간 메시지 상태/액션 (운영자·참여자 공용)
        ├── components/        StatusBar, QrCode, RequireOperator, ChatPanel
        └── routes/
            ├── Home.jsx
            ├── operator/       Login, Events(목록), NewEvent, EventDetail(메시지·스크린 제어)
            ├── player/         PlayerJoin (프로필 설정 + 대기화면 + 메시지)
            └── screen/         ScreenView (로고/QR 대기화면, 실시간 전환)
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

### 운영자 소켓 권한 (설계문서 §7-4, Phase 2)

- HTTP 로그인 세션을 소켓 핸드셰이크에서도 읽는다 (`io.engine.use(sessionMiddleware)`).
- `role: 'operator'` 로 `session:hello` 하면 로그인 여부 + 이벤트 소유권을 확인하고,
  통과해야 `socket.data.isAuthenticatedOperator` 가 켜진다.
- 스크린 모드 전환·메시지 고정/삭제·채팅 토글은 이 플래그 + 이벤트 코드 일치를 검사한다
  (`realtime/authz.js`). 로그인 안 한 소켓이나 다른 MC 는 전부 `FORBIDDEN`.

### 실시간 메시지 (설계문서 §5.1·§5.2, §9 결정)

- 참여자 닉네임을 표시하고, MC 는 메시지를 개별 삭제할 수 있다.
- 메시지는 이벤트별 서버 메모리에 최근 200개까지 보관(§4.2, DB 에는 저장하지 않음),
  재접속 시 `session:hello`/`player:join` 응답에 스냅샷을 함께 내려준다.
- 대형 스크린에는 메시지를 표시하지 않는다(운영자+참여자 룸에만 브로드캐스트).
- MC 는 채팅 비활성화 중에도 계속 메시지를 보낼 수 있다(공지 용도).

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

## Phase 2 에서 확인된 것

- [x] HTTP 로그인 세션을 소켓에 연결, 운영자 역할은 로그인+이벤트 소유권 검증 통과해야 활성화
- [x] 대형 스크린 로고 ↔ QR/코드 모드를 운영자가 실시간 전환(다른 화면들에 즉시 반영)
- [x] 실시간 메시지 송출(닉네임 표시) · 상단 고정 · 개별 삭제 · 참여자 채팅 활성화 토글 ·
      자동 스크롤 토글
- [x] 메시지는 운영자·참여자 룸에만 브로드캐스트(대형 스크린에는 노출 안 함)
- [x] 채팅 비활성화 중에도 MC 공지는 계속 가능, 참여자는 `CHAT_DISABLED` 로 차단
- [x] 재접속(새로고침) 시 메시지 이력·고정·채팅 상태 스냅샷 복원
- [x] 브라우저 3탭(운영자/참여자/스크린) E2E: 메시지 송수신·고정·삭제·채팅토글·
      스크린모드 전환이 모두 실시간으로 다른 화면에 반영되는지 확인

## 다음 (Phase 3 — 가위바위보 게임)

§6 상태 머신(설정→선택중→운영자 선택→결과→루프/종료) 구현, 3화면 연동, 엣지 케이스
(전멸 재대결, 패자부활전) 처리.
