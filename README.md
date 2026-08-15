# 실시간 참여형 레크레이션 웹

모든 작업의 기준 문서: [레크레이션웹_전체구조_설계문서_1.md](레크레이션웹_전체구조_설계문서_1.md)

현재 진행 상태: **Phase 6 — 배포/시험 진행 중** (배포 설정 완료, 실제 배포는 GitHub 연결 대기)

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

### 배포 — Render 무료 티어 (설계문서 §2.4, Phase 6)

저장소 루트의 [`render.yaml`](render.yaml) 로 Render 의 "New → Blueprint" 기능을 쓰면
빌드/시작 명령·헬스체크·`SESSION_SECRET` 자동 생성까지 한 번에 설정된다.

1. 이 저장소를 GitHub 에 올린다 (아직 안 했다면).
2. [Render 대시보드](https://dashboard.render.com) → **New** → **Blueprint** → 방금 올린
   저장소 선택 → `render.yaml` 을 인식하면 그대로 **Apply**.
3. 첫 배포가 끝나면 발급된 `https://*.onrender.com` 주소로 접속되는지 확인
   (`/api/health` 가 `{"ok":true,...}` 를 반환하면 정상).
4. Render 셸(대시보드의 **Shell** 탭)에서 운영자 계정을 만든다:
   ```bash
   node server/scripts/create-operator.mjs --email mc@example.com --name "홍길동"
   ```

**무료 티어에서 꼭 알아야 할 것 (2026년 기준):**
- **15분 무사용 시 슬립.** 행사 시작 30분 전엔 미리 접속해 깨워둔다 (설계문서 §3.3).
- **디스크가 영구 저장되지 않는다.** 무료 웹서비스는 퍼시스턴트 디스크를 붙일 수 없어서,
  재배포(또는 드물게 플랫폼 쪽 재시작)가 일어나면 SQLite 파일(`server/data/`)과 업로드된
  로고(`server/uploads/`)가 초기화된다. 시험 단계에서는 "행사 직전에 운영자 계정과
  이벤트를 새로 만든다"는 전제로 감안하고 쓰고, 데이터를 계속 보존해야 하는 시점이 되면
  Render 의 유료 플랜(퍼시스턴트 디스크) 또는 설계문서가 이미 예정해둔 PostgreSQL 전환으로
  넘어간다.
- 같은 서버가 클라이언트까지 서빙하므로(§ 위 "운영 빌드" 참고) 배포 환경에서는 별도
  `CORS_ORIGINS` 설정이 필요 없다 (동일 출처).

### 부하 테스트

```bash
node server/scripts/load-test.mjs --email mc@example.com --password ... \
  [--url http://localhost:4000] [--participants 50] [--target 5]
```

운영자 로그인 → 이벤트 생성 → 참여자 N명 동시 접속 → 가위바위보 한 판을 목표 승자 수까지
자동 진행시키고, 접속 소요 시간·핑 지연·라운드 수·최종 결과가 기대와 맞는지 검증한다.
로컬 개발 서버든 배포된 Render 주소든 `--url` 만 바꾸면 그대로 쓸 수 있다.

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
│       │   └── participants.js  점수 부여·팀 자동배정·팀 합산 쿼리 포함
│       ├── game/
│       │   └── rpsEngine.js   가위바위보 판정 순수 함수 (소켓/DB 와 무관, 단위 검증됨)
│       ├── routes/
│       │   ├── auth.js        로그인/로그아웃/me
│       │   └── events.js      이벤트 CRUD·이력·팀 자동배정 (gameRecords 포함)
│       └── realtime/
│           ├── index.js       소켓 연결 처리, 운영자 세션 인증, 접속 현황 브로드캐스트
│           ├── rooms.js       룸 이름 규칙 (event:CODE:role)
│           ├── authz.js       운영자 권한 액션 검증 (isAuthorizedOperator)
│           ├── players.js     참여자 입장/재접속/중복접속 처리
│           ├── eventState.js  이벤트별 실시간 상태(스크린 모드/채팅/메시지, 메모리)
│           ├── screen.js      스크린 모드 전환(로고 ↔ QR ↔ 순위)
│           ├── messages.js    실시간 메시지 송출/고정/삭제/채팅토글
│           ├── rps.js         가위바위보 게임 상태 머신 (§6, 메모리) + 종료 시 점수 반영
│           └── scoreboard.js  개인/팀 순위 스냅샷 계산 + scoreboard:update 브로드캐스트
└── client/                  React + Vite + Socket.IO Client
    └── src/
        ├── App.jsx           3화면 라우팅 (운영자는 중첩 라우트)
        ├── lib/{api,socket,rps}.js
        ├── hooks/
        │   ├── useAuth.jsx            운영자 로그인 상태 컨텍스트
        │   ├── useRealtimeSession.js  역할별 룸 접속 + presence + 초기 상태
        │   ├── usePlayerConnection.js 참여자 입장/자동 재접속
        │   ├── useChat.js             실시간 메시지 상태/액션 (운영자·참여자 공용)
        │   ├── useRpsGame.js          가위바위보 상태 동기화 + 액션 (역할 공용)
        │   └── useScoreboard.js       개인/팀 순위 상태 동기화 (역할 공용)
        ├── components/        StatusBar, QrCode, RequireOperator, ChatPanel, RankingBoard
        │   └── rps/            RpsOperatorPanel, RpsPlayerView, RpsScreenView
        └── routes/
            ├── Home.jsx
            ├── operator/       Login, Events(목록), NewEvent,
            │                   EventDetail(메시지·스크린·게임·팀배정·순위 제어)
            ├── player/         PlayerJoin (프로필 설정 + 대기화면 + 메시지 + 게임 + 순위)
            └── screen/         ScreenView (로고/QR/순위 대기화면 ↔ 게임 연출 자동 전환)
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

### 가위바위보 서바이벌 토너먼트 (설계문서 §6, Phase 3)

- 상태: `idle → selecting → locked → result → (selecting 로 루프 | ended)`.
  전부 `realtime/rps.js` 가 이벤트별 메모리에서 관리하고, 판정/분기 로직은
  `game/rpsEngine.js` 의 순수 함수(`judgeRound`, `resolveBranch`)로 분리해 별도 검증했다.
- 판정 분기(§6.2) 4가지 모두 구현·검증:
  - **초과**(생존자 > 목표): 확정자+이번 승자를 합쳐 다시 좁혀나간다.
  - **정확히 도달**: 종료, `game_records` 에 최종 승자 저장.
  - **전멸**(승자 0명): 라운드 무효, 같은 인원으로 재대결(라운드 번호 유지).
  - **부족**: 이번 승자는 확정 진출, 나머지는 패자부활전.
  - 선택하지 않은 참여자(무응답)는 자동으로 비승자 처리.
- 참여자에게는 본인 라운드 결과만, 운영자 확인 전까지는 아무에게도 MC 의 선택을
  보여주지 않는다(`locked` 동안 `operatorChoice` 는 브로드캐스트에서 제외).
- 대형 스크린은 게임이 진행 중이면(status !== idle) 로고/QR 모드 대신 자동으로
  게임 연출(참여 현황·모래시계·MC 의 손·최종 승자)로 전환된다.
- 모래시계는 마감을 자동으로 트리거하지 않는 순수 시각 연출이다(§9 결정) — 실제
  마감은 MC 의 수동 "마감" 클릭으로 확정.
- 운영자 액션(`rps:start/lock/confirm/advance/restartRound/reset`)은 전부
  `isAuthorizedOperator` 검증을 거친다. 참여자는 자기 차례에만 `rps:choose` 가능.
- 재접속 시 `player:join` 응답에 게임 스냅샷과 "이번 라운드 내 선택값"을 함께 내려줘
  새로고침해도 같은 화면으로 복원된다.

### 점수/순위 시스템 (설계문서 §9 결정, Phase 4)

- **점수**: 게임(현재 가위바위보)의 최종 승자에게만 동일 점수(기본 100점) 부여,
  중도 탈락자는 0점. `realtime/rps.js` 의 `ended` 분기에서 `db/participants.js`
  의 `addScore` 를 호출하고 즉시 `scoreboard:update` 를 브로드캐스트한다.
- **팀 배정**: 자동 랜덤. `POST /api/events/:id/teams/assign` (팀 수 2~10, 참여자
  수보다 많으면 거부)에 현재 활성 참여자를 셔플해 균등 배분. 다시 호출하면 전체
  재배정. 팀 순위는 팀원 개인 점수 합산(`listTeamScores`, SQL `GROUP BY team_id`).
- **실시간 동기화**: `session:hello`/`player:join` 응답에 `scoreboard` 스냅샷을
  포함해 재접속 시 즉시 복원되고, 이후 점수가 바뀔 때마다 `scoreboard:update` 로
  운영자·참여자·스크린 전원에게 브로드캐스트된다 (`realtime/scoreboard.js`).
- **화면별 표시**: 운영자 화면은 개인 순위 패널 + 참여자 표의 팀/점수 컬럼이 실시간
  갱신되고, 참여자 화면은 "내 누적 점수"와 순위 목록이 실시간 갱신되며, 대형
  스크린은 MC 가 "순위 표시" 모드로 전환하면(팀전이면 팀 순위, 개인전이면 개인
  순위) 큰 화면으로 보여준다. 게임이 진행 중이면 게임 연출이 순위 모드보다
  우선한다.
- **운영 안정성 보완**: `httpServer.close()` 가 열려 있는 소켓(브라우저 탭)
  때문에 영원히 안 끝나는 문제를 발견해, `io.close()` + 3초 강제 종료 타임아웃으로
  교체했다 (재배포·재시작 시 행 걸림 방지).

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

## Phase 3 에서 확인된 것

- [x] 판정 엔진 단위 검증(10개 케이스) + 소켓 스모크 테스트(38개 체크, §6.2 4개 분기
      전부 포함) + 재접속 복원 검증(7개 체크) — 전부 통과
- [x] 브라우저 3탭(운영자/참여자 2명/스크린) E2E: 목표 1명 게임 한 판 완주
      (선택→마감→운영자 선택→확인→결과→다음→종료), 3화면 모두 실시간 반영 확인
- [x] `game_records` 저장 확인 (최종 승자·라운드 수)
- [x] 운영자 권한 검증(비로그인/참여자의 게임 제어 시도 거부)
- [x] `useAuth` 초기 세션 확인과 로그인이 겹칠 때 상태가 꼬이는 경쟁 상태(race
      condition) 발견 후 수정 — 뒤늦게 도착하는 초기 확인 결과가 방금 로그인한
      상태를 덮어쓰지 않도록 `settledRef` 가드 추가

## Phase 4 에서 확인된 것

- [x] 소켓 스모크 테스트 15건(점수 부여, 팀 균등 배정, 검증 로직, 브로드캐스트,
      재접속 스냅샷 복원 포함) — 전부 통과
- [x] 브라우저 E2E: 4명 참여 → 2팀 자동 배정(2/2 균등) → RPS 게임 완주 → 승자 팀에
      100점 반영 → 운영자·참여자·대형 스크린 3화면 모두 실시간 순위 갱신 확인
- [x] 개인전/팀전 각각 순위 화면 확인 (팀전은 팀 합산, 개인전은 개인별)
- [x] `screen:setMode('ranking')` 대형 스크린 순위 모드 검증
- [x] 실제 버그 2건 발견 후 수정:
      1. 대형 스크린용 `event` 스냅샷에 `mode` 필드가 빠져 있어 팀전 순위 모드가
         팀 합산이 아니라 개인별로 잘못 표시되던 문제
      2. 소켓 연결이 남아있으면 서버 graceful shutdown 이 끝나지 않던 문제
         (`io.close()` + 타임아웃으로 교체)

## Phase 5 에서 확인된 것

- [x] `/apple-design` 스킬 기준 디자인 파운데이션 정비: 아이보리/화이트 배경 팔레트를
      CSS 변수(`--bg`, `--surface`, `--accent` 등)로 토큰화, 반경/그림자 스케일
      (`--radius-*`, `--shadow-*`) 도입, 버튼 눌림(`:active` scale)·카드 그림자·
      스티키 반투명 상단바(`backdrop-filter`) 적용
- [x] `motion`(framer-motion 후속) 라이브러리 도입, 공용 스프링 프리셋
      (`motionPresets.js` — 임계감쇠 기본 + 모멘텀이 실린 순간에만 바운스) 정의
- [x] 운영자 화면: 가위바위보 상태 전환(선택/잠김/결과)에 스프링 트랜지션,
      MC 선택 버튼에 `whileTap` 즉각 피드백, 순위 리스트 자동 재정렬 애니메이션
- [x] 참여자 화면: 선택 버튼 `whileTap` 피드백, 결과·최종 승자 리빌에 바운스 있는
      스프링 등장, 채팅 메시지 슬라이드인 + 고정 메시지 등장/퇴장 애니메이션
- [x] 대형 스크린: 라운드/결과/최종승자 각 단계에 임팩트 있는 스케일 리빌,
      로고 ↔ QR ↔ 순위 ↔ 게임 모드 전환에 크로스페이드+스케일 "materialize" 전환
- [x] 접근성: `prefers-reduced-motion`/`prefers-reduced-transparency` CSS 폴백에
      더해, `motion/react` 의 `<MotionConfig reducedMotion="user">` 를 앱 루트에
      적용해 스프링 기반 리빌·전환도 OS의 "동작 줄이기" 설정을 따르도록 함
- [x] 브라우저 3탭(운영자/참여자/스크린) E2E: 이벤트 생성 → 참여 → 채팅 →
      가위바위보 한 판 완주(선택→마감→MC선택→확인→결과→종료, 100점 반영) →
      대형 스크린 순위 모드 전환까지 실시간 반영과 애니메이션 동작 확인, 콘솔 에러 없음
- [x] 저작권: 참고 이미지(Urbanbrush "BBOMBBOM")를 그대로 재현하지 않고, 같은
      스타일의 독자적인 SVG 라인아트 손 모양 아이콘(`HandIcons.jsx`)으로 대체

## Phase 6 에서 확인된 것 (진행 중)

- [x] Render 배포 설정 준비: [`render.yaml`](render.yaml) 블루프린트(빌드/시작 명령,
      헬스체크 `/api/health`, `SESSION_SECRET` 자동 생성, `singapore` 리전)
- [x] `.gitignore` 버그 수정 — `server/data`, `server/uploads` 를 실제로 무시하지
      못하던 패턴(`data/*.sqlite*` → `**/data/*.sqlite*`)을 배포 전에 바로잡음
      (그대로 뒀으면 운영자 비밀번호 해시가 든 SQLite 파일이 커밋될 뻔했다)
- [x] 부하 테스트 스크립트(`server/scripts/load-test.mjs`) 작성 및 로컬 개발 서버 기준
      50명 규모 검증: 50/50 동시 접속 성공(약 40~60ms), 핑 왕복 지연 p50 0~1ms,
      가위바위보 한 판(목표 승자 5명)이 3~9라운드·1~6초 내 정확한 결과로 완주 —
      100명 규모로도 추가 검증(100/100 접속 성공, 6라운드·2.5초)
- [x] 부하 테스트 스크립트 자체의 경쟁 상태(race condition) 버그 발견 후 수정 —
      운영자 자동 진행 로직이 `await` 로 풀리는 "처리 중" 플래그에 의존했는데,
      마이크로태스크가 반영되기 전에 다음 상태 브로드캐스트가 같은 틱에서 먼저
      도착해 무시되는 경우가 있었다 (특히 게임 종료 시점). 액션을 시작하는 순간
      동기적으로 갱신되는 phase 비교 방식으로 바꿔 해결
- [ ] 실제 Render 배포 (GitHub 저장소 연결 필요 — 아직 원격 저장소 없음)
- [ ] 배포된 주소 기준 50명 부하 재검증
- [ ] 실전 시험 진행 후 보완

## 다음

Phase 6 마무리(실제 배포 + 배포 환경 재검증) 후 Phase 7+(게임 추가, 규모 확장, 결제).
