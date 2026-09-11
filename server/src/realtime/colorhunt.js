import { createGameRecord } from '../db/gameRecords.js';
import { getEventByCode } from '../db/events.js';
import { addScore, getParticipantById, listParticipantsByEvent } from '../db/participants.js';
import { adjust } from '../game/adaptive.js';
import {
  PALETTE,
  TOLERANCE_DEFAULT,
  TOLERANCE_MAX,
  TOLERANCE_MIN,
  colorById,
  firstAttemptFailRate,
  judge,
  pickColor,
  pointsFor,
} from '../game/colorhuntEngine.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode } from './rooms.js';
import { broadcastScoreboard } from './scoreboard.js';

// '색깔 사냥' 실시간 상태 (maze.js/wordcloud.js 와 같은 구조 — 이벤트별 서버 메모리).
//
// ── 사진은 여기까지 오지 않는다 ─────────────────────────────────────────────
// 참여자 폰이 보내는 건 hex 문자열 하나와 시간뿐이다. 그런데도 **통과 여부는 여기서
// 다시 계산한다** — 폰이 "통과했어요"라고 말해도 받지 않는다. 이미지를 받지 않으면서
// 설계문서 §7-4("서버가 유일한 진실")를 지키는 방법이다.
//
// ── 탈락이 없다 ────────────────────────────────────────────────────────────
// 못 찾은 사람이 먼저 빠지는 구조를 쓰지 않는다. 통과할 때까지 다시 찍을 수 있고,
// 빨리 맞힐수록 점수를 더 받을 뿐이다. 그래서 늦게 찾은 사람도 끝까지 게임 안에 있다.

const games = new Map(); // eventCode -> ColorhuntGameState
const THROTTLE_MS = 200; // 제출이 몰려도 화면이 버티도록 (wordcloud 와 같은 이유)
const pendingBroadcast = new Map();

// 한 사람이 이보다 빨리 다시 제출할 수는 없다. 사람 손으로는 안 되는 속도라
// 이걸 넘으면 스크립트다. 서버가 판정하므로 조작은 안 되지만 폭주는 막아야 한다.
const MIN_SUBMIT_GAP_MS = 300;

const TOLERANCE_STEP = 0.1;

function createInitialState() {
  return {
    status: 'idle', // idle | ready | hunting | closed | ended
    round: 0,
    targetId: null,
    tolerance: TOLERANCE_DEFAULT,
    startedAt: null,
    readyIds: [], // 카메라 허용을 마친 사람
    // participantId -> { attempts, firstPass, passed, hex, elapsedMs, points, lastAt }
    submissions: new Map(),
    history: [], // 라운드별 요약 (기록 저장용)
    earned: new Map(), // participantId -> 이 게임에서 받은 누적 점수
    queue: [], // 아이패드 1대로 하는 게임(후출 가위바위보)이 쓸 대기열 자리
  };
}

function getState(eventCode) {
  const code = normalizeEventCode(eventCode);
  let state = games.get(code);
  if (!state) {
    state = createInitialState();
    games.set(code, state);
  }
  return state;
}

function nicknameOf(id) {
  return getParticipantById(id)?.nickname ?? '알 수 없음';
}

function publicTarget(state) {
  const c = colorById(state.targetId);
  // 팔레트 전체를 내보내지 않는다 — 지금 출제된 색만 알면 된다
  return c ? { id: c.id, name: c.name, swatch: c.swatch } : null;
}

/**
 * 대형화면·진행자·참여자가 함께 보는 상태.
 *
 * 타일에는 닉네임과 hex 만 들어간다. 사진은 애초에 서버에 없고, 있더라도 여기에
 * 넣지 않는다 — 아이가 섞인 행사에서 얼굴이 큰 화면에 뜨는 경로를 만들지 않는다.
 */
function publicState(state) {
  const tiles = [...state.submissions.entries()].map(([participantId, s]) => ({
    participantId,
    nickname: nicknameOf(participantId),
    hex: s.hex,
    passed: s.passed,
    attempts: s.attempts,
  }));
  // 통과한 사람을 앞에, 그 안에서는 빨리 맞힌 순으로 — 대형화면이 저절로 순위표가 된다
  tiles.sort((a, b) => Number(b.passed) - Number(a.passed) || a.attempts - b.attempts);

  const done = tiles.filter((t) => t.passed).length;

  return {
    status: state.status,
    round: state.round,
    target: publicTarget(state),
    tolerance: state.tolerance,
    startedAt: state.startedAt,
    readyIds: state.readyIds,
    tiles,
    passedCount: done,
    submittedCount: tiles.length,
    roundCount: state.history.length,
    // 진행자에게만 의미 있는 값이지만 숨길 이유가 없다
    lastRound: state.history.at(-1) ?? null,
    palette: PALETTE.map((c) => ({ id: c.id, name: c.name, swatch: c.swatch })),
    ranking:
      state.status === 'ended'
        ? [...state.earned.entries()]
            .map(([participantId, points]) => ({ participantId, nickname: nicknameOf(participantId), points }))
            .sort((a, b) => b.points - a.points)
        : null,
  };
}

function broadcastNow(io, code) {
  const timer = pendingBroadcast.get(code);
  if (timer) {
    clearTimeout(timer);
    pendingBroadcast.delete(code);
  }
  io.to(eventRoom(code)).emit('colorhunt:state', publicState(getState(code)));
}

function broadcastThrottled(io, code) {
  if (pendingBroadcast.has(code)) return;
  const timer = setTimeout(() => {
    pendingBroadcast.delete(code);
    io.to(eventRoom(code)).emit('colorhunt:state', publicState(getState(code)));
  }, THROTTLE_MS);
  pendingBroadcast.set(code, timer);
}

export function getColorhuntSnapshot(eventCode) {
  return publicState(getState(eventCode));
}

/** 재접속 시 이 참여자의 이번 라운드 상황을 되살린다 (본인에게만 보낸다). */
export function getYourColorhunt(eventCode, participantId) {
  const s = getState(eventCode).submissions.get(participantId);
  if (!s) return null;
  return { attempts: s.attempts, passed: s.passed, hex: s.hex, points: s.points };
}

function isPlayerOf(socket, code) {
  return (
    socket.data.role === 'player' &&
    !!socket.data.participantId &&
    socket.data.eventCode === code
  );
}

/** 이번 라운드를 닫고 요약을 남긴다. 점수는 라운드마다 바로 반영한다. */
function closeRound(io, code) {
  const state = getState(code);
  const rows = [...state.submissions.entries()].map(([participantId, s]) => ({
    participantId,
    nickname: nicknameOf(participantId),
    hex: s.hex,
    passed: s.passed,
    attempts: s.attempts,
    firstPass: s.firstPass,
    elapsedMs: s.elapsedMs,
    points: s.points,
  }));

  const failRate = firstAttemptFailRate(rows);
  const summary = {
    round: state.round,
    targetId: state.targetId,
    targetName: colorById(state.targetId)?.name ?? '?',
    tolerance: state.tolerance,
    firstAttemptFailRate: failRate,
    submitted: rows.length,
    passed: rows.filter((r) => r.passed).length,
    rows,
  };
  state.history.push(summary);

  // 점수는 이번 라운드가 끝날 때 바로 준다. 게임이 다 끝날 때까지 순위표가 안 움직이면
  // 참여자가 자기가 잘하고 있는지 알 수 없다 (의자·무궁화와 같은 방식).
  const event = getEventByCode(code);
  for (const r of rows) {
    if (r.points > 0) {
      addScore(r.participantId, r.points);
      state.earned.set(r.participantId, (state.earned.get(r.participantId) ?? 0) + r.points);
    }
  }
  if (event) broadcastScoreboard(io, code, event.id);

  // 다음 라운드 난이도 — 첫 시도 실패율을 20~30% 로 되돌리는 방향으로만 움직인다
  state.tolerance = adjust(state.tolerance, failRate, {
    step: TOLERANCE_STEP,
    min: TOLERANCE_MIN,
    max: TOLERANCE_MAX,
    sampleSize: rows.length,
  });

  state.status = 'closed';
}

export function registerColorhuntHandlers(io, socket) {
  /** 진행자가 이 게임 패널을 펼치면 참여자 폰에 '카메라 켜기'가 뜬다.
   *  출제한 뒤에 권한 팝업을 띄우면 그 사람만 한참 늦는다 (미로에서 겪은 문제). */
  socket.on('colorhunt:prepare', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'idle') return reply({ ok: true }); // 진행 중이면 건드리지 않는다

    state.status = 'ready';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  /** 진행자가 다른 게임으로 넘어가면 참여자 화면에서도 치운다 (카메라도 꺼진다). */
  socket.on('colorhunt:unprepare', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'ready') return reply({ ok: true });

    state.status = 'idle';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  /** 카메라 허용을 마쳤다고 알린다. 진행자가 "허용 12/15명"을 보고 시작 시점을 잡는다. */
  socket.on('colorhunt:ready', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isPlayerOf(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    const id = socket.data.participantId;
    if (state.readyIds.includes(id)) return reply({ ok: true });

    state.readyIds = [...state.readyIds, id];
    reply({ ok: true });
    broadcastNow(io, code);
  });

  /** 출제 — 색 하나를 걸고 사냥을 연다. */
  socket.on('colorhunt:ask', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status === 'hunting') return reply({ ok: false, error: 'ROUND_IN_PROGRESS' });

    const event = getEventByCode(code);
    if (!event) return reply({ ok: false, error: 'EVENT_NOT_FOUND' });
    const active = listParticipantsByEvent(event.id).filter((p) => p.status === 'active');
    if (active.length === 0) return reply({ ok: false, error: 'NOT_ENOUGH_PARTICIPANTS' });

    // 진행자가 고르거나, 비워두면 서버가 뽑는다 (직전 색은 피한다)
    const chosen = payload.colorId ? colorById(String(payload.colorId)) : pickColor(state.targetId);
    if (!chosen) return reply({ ok: false, error: 'INVALID_COLOR' });

    state.targetId = chosen.id;
    state.round += 1;
    state.status = 'hunting';
    state.startedAt = Date.now();
    state.submissions = new Map();

    reply({ ok: true, colorId: chosen.id });
    broadcastNow(io, code);
  });

  /**
   * 제출 — 폰이 뽑은 대표색 hex 하나.
   * 통과 여부는 여기서 계산한다. 폰이 보낸 판정은 읽지도 않는다.
   */
  socket.on('colorhunt:submit', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isPlayerOf(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'hunting') return reply({ ok: false, error: 'NOT_HUNTING' });

    const id = socket.data.participantId;
    const prev = state.submissions.get(id);
    if (prev?.passed) return reply({ ok: false, error: 'ALREADY_PASSED' });

    const now = Date.now();
    if (prev && now - prev.lastAt < MIN_SUBMIT_GAP_MS) {
      return reply({ ok: false, error: 'TOO_FAST' });
    }

    const target = colorById(state.targetId);
    const verdict = judge(payload.hex, target, state.tolerance);
    if (verdict.reason === 'BAD_HEX') return reply({ ok: false, error: 'INVALID_HEX' });

    const attempts = (prev?.attempts ?? 0) + 1;
    const points = verdict.pass ? pointsFor(attempts) : 0;
    const entry = {
      attempts,
      // 첫 시도에 맞혔는지만 난이도 신호로 쓴다 (재촬영이 무제한이라 최종 성공률은 늘 100% 로 수렴한다)
      firstPass: prev ? prev.firstPass : verdict.pass,
      passed: verdict.pass,
      hex: String(payload.hex).toLowerCase(),
      elapsedMs: verdict.pass && state.startedAt ? now - state.startedAt : null,
      points,
      lastAt: now,
    };
    state.submissions.set(id, entry);

    reply({ ok: true, pass: verdict.pass, attempts, points, reason: verdict.reason });
    broadcastThrottled(io, code);
  });

  /** 마감 — 더 못 내게 막고, 점수를 반영하고, 다음 라운드 난이도를 정한다. */
  socket.on('colorhunt:close', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'hunting') return reply({ ok: false, error: 'NOT_HUNTING' });

    closeRound(io, code);
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('colorhunt:end', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status === 'idle' || state.status === 'ended') {
      return reply({ ok: false, error: 'NOT_RUNNING' });
    }
    // 마감하지 않고 바로 끝내도 이번 라운드가 날아가지 않게 한다
    if (state.status === 'hunting') closeRound(io, code);

    const event = getEventByCode(code);
    if (event) {
      createGameRecord({
        eventId: event.id,
        gameType: 'colorhunt',
        result: {
          rounds: state.history.map((h) => ({
            round: h.round,
            color: h.targetName,
            tolerance: h.tolerance,
            submitted: h.submitted,
            passed: h.passed,
            firstAttemptFailRate: h.firstAttemptFailRate,
          })),
          totals: [...state.earned.entries()]
            .map(([participantId, points]) => ({ participantId, nickname: nicknameOf(participantId), points }))
            .sort((a, b) => b.points - a.points),
        },
      });
    }

    state.status = 'ended';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('colorhunt:reset', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const timer = pendingBroadcast.get(code);
    if (timer) {
      clearTimeout(timer);
      pendingBroadcast.delete(code);
    }
    games.set(code, createInitialState());
    reply({ ok: true });
    broadcastNow(io, code);
  });
}
