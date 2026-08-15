#!/usr/bin/env node
// 부하 테스트 CLI (설계문서 Phase 6 — 50명 부하 테스트).
// 로컬 개발 서버든 배포된 서버든 대상 URL만 바꿔서 그대로 쓸 수 있다.
//
// 사용법:
//   node server/scripts/load-test.mjs --email mc@example.com --password ... \
//     [--url http://localhost:4000] [--participants 50] [--target 5]
//
// 동작: 운영자 로그인 → 이벤트 생성 → 참여자 N명 동시 접속 →
//       가위바위보 한 판을 목표 승자 수만큼 자동 진행 → 결과 요약 출력.

import { io as ioClient } from 'socket.io-client';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const BASE_URL = (args.url ?? 'http://localhost:4000').replace(/\/$/, '');
const EMAIL = args.email;
const PASSWORD = args.password;
const PARTICIPANT_COUNT = Number(args.participants ?? 50);
const TARGET_WINNERS = Number(args.target ?? Math.max(1, Math.round(PARTICIPANT_COUNT / 10)));
const CHOICES = ['rock', 'paper', 'scissors'];

if (!EMAIL || !PASSWORD) {
  console.error(
    '사용법: node server/scripts/load-test.mjs --email <운영자 이메일> --password <비밀번호> ' +
      '[--url http://localhost:4000] [--participants 50] [--target 5]\n' +
      '운영자 계정이 없다면 먼저: node server/scripts/create-operator.mjs --email ... --password ...',
  );
  process.exit(1);
}

async function loginOperator() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(`로그인 실패: ${JSON.stringify(data)}`);
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error('세션 쿠키를 받지 못했습니다');
  return setCookie.split(';')[0];
}

async function createEvent(cookie) {
  const res = await fetch(`${BASE_URL}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      name: `부하테스트 ${new Date().toISOString()}`,
      mode: 'individual',
      maxParticipants: Math.max(50, PARTICIPANT_COUNT),
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(`이벤트 생성 실패: ${JSON.stringify(data)}`);
  return data.event;
}

async function endEvent(cookie, eventId) {
  await fetch(`${BASE_URL}/api/events/${eventId}/end`, {
    method: 'POST',
    headers: { cookie },
  }).catch(() => {});
}

function connectSocket(cookie) {
  return ioClient(BASE_URL, {
    transports: ['websocket'],
    extraHeaders: cookie ? { cookie } : undefined,
    reconnection: false,
  });
}

function emitAsync(socket, event, payload, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} 응답 타임아웃(${timeoutMs}ms)`)), timeoutMs);
    socket.emit(event, payload, (res) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function joinParticipants(eventCode) {
  const start = performance.now();
  const entries = Array.from({ length: PARTICIPANT_COUNT }, (_, i) => ({
    nickname: `참가자${i + 1}`,
    pin: String(1000 + i).slice(-4),
    socket: connectSocket(),
    id: null,
  }));

  const results = await Promise.allSettled(
    entries.map(
      (entry) =>
        new Promise((resolve, reject) => {
          entry.socket.on('connect_error', (err) => reject(err));
          entry.socket.on('connect', () => {
            entry.socket.emit(
              'player:join',
              { eventCode, nickname: entry.nickname, pin: entry.pin },
              (res) => {
                if (!res?.ok) return reject(new Error(`${entry.nickname}: ${res?.error ?? 'UNKNOWN'}`));
                entry.id = res.participant.id;
                resolve();
              },
            );
          });
        }),
    ),
  );

  const joinMs = performance.now() - start;
  const failures = results
    .map((r, i) => (r.status === 'rejected' ? { entry: entries[i], reason: r.reason } : null))
    .filter(Boolean);
  const succeeded = entries.filter((_, i) => results[i].status === 'fulfilled');

  return { entries: succeeded, joinMs, failures };
}

async function measurePingLatency(entries, sampleSize = 10) {
  const sample = entries.slice(0, Math.min(sampleSize, entries.length));
  const latencies = await Promise.all(
    sample.map(
      ({ socket }) =>
        new Promise((resolve) => {
          const sentAt = performance.now();
          socket.emit('session:ping', { sentAt }, () => resolve(performance.now() - sentAt));
        }),
    ),
  );
  return latencies.sort((a, b) => a - b);
}

// 참여자 소켓들이 게임 상태를 받아 자동으로 대응하도록 리스너를 건다.
// (선택 단계에선 무작위 선택 후 제출, 그 외 단계는 무시)
function wireAutoPlayers(entries, eventCode) {
  // 전멸(wipeout) 분기는 같은 라운드 번호를 유지한 채 선택만 초기화하므로,
  // 라운드 번호가 아니라 서버가 내려주는 chosenParticipantIds 로 "이미 제출했는지"를 판단한다.
  entries.forEach(({ socket, id }) => {
    socket.on('game:state', (state) => {
      if (state.status !== 'selecting') return;
      if (!state.activeParticipantIds.includes(id)) return;
      if (state.chosenParticipantIds.includes(id)) return;
      const choice = CHOICES[Math.floor(Math.random() * CHOICES.length)];
      socket.emit('rps:choose', { eventCode, choice });
    });
  });
}

// 운영자 쪽에서 라운드를 자동으로 진행: 선택 대기 → 마감 → MC 선택 → 확인 → 다음.
async function runAutoGame(operatorSocket, eventCode) {
  const roundStart = performance.now();
  let rounds = 0;

  const startRes = await emitAsync(operatorSocket, 'rps:start', { eventCode, targetWinners: TARGET_WINNERS });
  if (!startRes.ok) throw new Error(`게임 시작 실패: ${JSON.stringify(startRes)}`);

  return new Promise((resolve, reject) => {
    // 진행 단계를 "다음 game:state 콜백이 busy 플래그를 async 로 되돌리기 전에 도착하면
    // 무시된다"는 경쟁 상태 없이 추적하기 위해, 액션을 시작하는 그 순간(await 전) 동기적으로
    // phase 를 갱신하고, 이후 들어오는 브로드캐스트는 phase 와 다를 때만 반응한다.
    // (throttled 로 같은 상태가 여러 번 오거나, 전멸(wipeout)로 라운드 번호는 그대로인 채
    //  'selecting' 이 다시 오는 경우 모두 이 방식으로 정확히 구분된다.)
    let phase = null;
    let settled = false;

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimer);
      operatorSocket.off('game:state', onState);
      fn(value);
    };

    const safetyTimer = setTimeout(
      () => settle(reject, new Error('게임이 60초 안에 끝나지 않았습니다')),
      60000,
    );

    const onState = (state) => {
      if (process.env.LOAD_TEST_DEBUG) {
        console.error(
          `[debug] status=${state.status} round=${state.round} phase=${phase} ` +
            `active=${state.activeParticipantIds.length} chosen=${state.chosenParticipantIds.length} ` +
            `confirmed=${state.confirmedWinnerIds.length}`,
        );
      }

      if (state.status === 'ended') {
        settle(resolve, {
          rounds,
          totalMs: performance.now() - roundStart,
          finalWinnerCount: state.finalWinners?.length ?? 0,
        });
        return;
      }

      // wipeout 재대결은 status/round 가 그대로라서 위 판별로는 안 잡히고, 오직
      // chosenParticipantIds 가 0 으로 리셋된 것으로만 구분된다.
      const isFreshSelecting = state.status === 'selecting' && state.chosenParticipantIds.length === 0;
      if (state.status === phase && !isFreshSelecting) return;
      phase = state.status;

      (async () => {
        try {
          if (state.status === 'selecting') {
            rounds = state.round;
            // 참여자들이 무작위로 선택을 제출할 시간을 잠깐 준다 (실제 이벤트의 모래시계 흉내).
            await new Promise((r) => setTimeout(r, 400));
            const res = await emitAsync(operatorSocket, 'rps:lock', { eventCode });
            if (!res?.ok) console.error(`[경고] rps:lock 실패: ${JSON.stringify(res)}`);
          } else if (state.status === 'locked') {
            const choice = CHOICES[Math.floor(Math.random() * CHOICES.length)];
            const res = await emitAsync(operatorSocket, 'rps:confirm', { eventCode, choice });
            if (!res?.ok) console.error(`[경고] rps:confirm 실패: ${JSON.stringify(res)}`);
          } else if (state.status === 'result') {
            const res = await emitAsync(operatorSocket, 'rps:advance', { eventCode });
            if (!res?.ok) console.error(`[경고] rps:advance 실패: ${JSON.stringify(res)}`);
          }
        } catch (err) {
          settle(reject, err);
        }
      })();
    };

    operatorSocket.on('game:state', onState);
  });
}

async function main() {
  console.log(`[부하테스트] 대상 ${BASE_URL} · 참여자 ${PARTICIPANT_COUNT}명 · 목표 승자 ${TARGET_WINNERS}명`);

  const cookie = await loginOperator();
  const event = await createEvent(cookie);
  console.log(`[부하테스트] 이벤트 생성 완료: 코드 ${event.code}`);

  const operatorSocket = connectSocket(cookie);
  await new Promise((resolve, reject) => {
    operatorSocket.on('connect', resolve);
    operatorSocket.on('connect_error', reject);
  });
  const helloRes = await emitAsync(operatorSocket, 'session:hello', { role: 'operator', eventCode: event.code });
  if (!helloRes.ok) throw new Error(`운영자 접속 실패: ${JSON.stringify(helloRes)}`);

  console.log(`[부하테스트] 참여자 ${PARTICIPANT_COUNT}명 동시 접속 시작...`);
  const { entries, joinMs, failures } = await joinParticipants(event.code);
  console.log(
    `[부하테스트] 접속 결과: ${entries.length}/${PARTICIPANT_COUNT} 성공, ${joinMs.toFixed(0)}ms 소요`,
  );
  failures.forEach((f) => console.error(`  실패: ${f.entry.nickname} — ${f.reason?.message ?? f.reason}`));

  const latencies = await measurePingLatency(entries);
  if (latencies.length > 0) {
    console.log(
      `[부하테스트] 왕복 지연(ping, 표본 ${latencies.length}개): ` +
        `p50=${percentile(latencies, 50).toFixed(0)}ms, ` +
        `p90=${percentile(latencies, 90).toFixed(0)}ms, ` +
        `max=${latencies[latencies.length - 1].toFixed(0)}ms`,
    );
  }

  wireAutoPlayers(entries, event.code);
  console.log('[부하테스트] 가위바위보 자동 진행 시작...');
  const gameResult = await runAutoGame(operatorSocket, event.code);
  console.log(
    `[부하테스트] 게임 종료: ${gameResult.rounds}라운드, ${(gameResult.totalMs / 1000).toFixed(1)}초, ` +
      `최종 승자 ${gameResult.finalWinnerCount}명 (목표 ${TARGET_WINNERS}명)`,
  );

  entries.forEach(({ socket }) => socket.disconnect());
  operatorSocket.disconnect();
  await endEvent(cookie, event.id);

  const ok = entries.length === PARTICIPANT_COUNT && gameResult.finalWinnerCount === TARGET_WINNERS;
  console.log(ok ? '\n[부하테스트] 통과 ✅' : '\n[부하테스트] 확인 필요 ⚠️ (위 로그 참고)');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[부하테스트] 실패:', err);
  process.exit(1);
});
