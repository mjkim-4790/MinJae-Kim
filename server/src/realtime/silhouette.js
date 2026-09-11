import { createGameRecord } from '../db/gameRecords.js';
import { getEventByCode } from '../db/events.js';
import { addScore, getParticipantById, listParticipantsByEvent } from '../db/participants.js';
import { adjust } from '../game/adaptive.js';
import {
  HOLD_MS,
  POSES,
  READY_MS,
  ROUND_MS,
  THRESHOLD_DEFAULT,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  THRESHOLD_STEP,
  clampThreshold,
  matchScore,
  pickPose,
  poseById,
  pointsFor,
} from '../game/silhouetteEngine.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode } from './rooms.js';
import { broadcastScoreboard } from './scoreboard.js';

// '실루엣 통과' 실시간 상태.
//
// 아이패드 한 대 앞에 한 명씩 서서, 화면에 뜬 사람 모양을 몸으로 따라 한다.
// 자세 인식은 아이패드 안에서 끝나고, 서버로는 **관절 각도 8개(숫자)** 만 온다.
// 영상도 관절 좌표도 보내지 않는다 — 각도만으로 채점이 되기 때문이다.
// 맞았는지는 여기서 계산한다 (아이패드가 보낸 점수는 받지 않는다).
//
// 팔을 오래 들고 있게 만들지 않는다 (운영 결정). 자세가 맞는 순간 바로 끝난다.

const games = new Map();
const timers = new Map();
// 각도는 초당 여러 번 올라온다. 그때마다 전체 상태를 뿌리면 화면이 버벅인다.
const LIVE_THROTTLE_MS = 120;
const lastLive = new Map();

function clearPhaseTimer(code) {
  const t = timers.get(code);
  if (t) {
    clearTimeout(t);
    timers.delete(code);
  }
}

function createInitialState() {
  return {
    status: 'idle', // idle | ready | playing | result | ended
    threshold: THRESHOLD_DEFAULT,
    currentId: null,
    poseId: null,
    phase: null, // ready | posing
    phaseEndsAt: null,
    startedAt: null,
    live: { match: 0, best: 0, holding: false }, // 지금 얼마나 닮았는지 (화면 표시용)
    holdStartedAt: null,
    lastResult: null,
    history: [],
    earned: new Map(),
    doneIds: [],
  };
}

function getState(eventCode) {
  const code = normalizeEventCode(eventCode);
  let s = games.get(code);
  if (!s) {
    s = createInitialState();
    games.set(code, s);
  }
  return s;
}

function nicknameOf(id) {
  return id == null ? null : getParticipantById(id)?.nickname ?? '알 수 없음';
}

function publicState(state) {
  const pose = poseById(state.poseId);
  return {
    status: state.status,
    threshold: state.threshold,
    currentId: state.currentId,
    currentNickname: nicknameOf(state.currentId),
    doneIds: state.doneIds,
    phase: state.phase,
    phaseEndsAt: state.phaseEndsAt,
    // 따라 할 모양은 숨길 이유가 없다 — 보고 따라 하는 게 이 게임이다
    pose: pose ? { id: pose.id, name: pose.name, hint: pose.hint, points: pose.points } : null,
    live: state.live,
    lastResult: state.lastResult,
    playedCount: state.history.length,
    poseList: POSES.map((p) => ({ id: p.id, name: p.name })),
    ranking:
      state.status === 'ended'
        ? [...state.earned.entries()]
            .map(([participantId, points]) => ({ participantId, nickname: nicknameOf(participantId), points }))
            .sort((a, b) => b.points - a.points)
        : null,
  };
}

function broadcast(io, code) {
  lastLive.delete(code);
  io.to(eventRoom(code)).emit('silhouette:state', publicState(getState(code)));
}

/** 각도가 올라올 때마다 전부 뿌리지 않고 묶어서 내보낸다. */
function broadcastLive(io, code) {
  const now = Date.now();
  if (now - (lastLive.get(code) ?? 0) < LIVE_THROTTLE_MS) return;
  lastLive.set(code, now);
  io.to(eventRoom(code)).emit('silhouette:state', publicState(getState(code)));
}

export function getSilhouetteSnapshot(eventCode) {
  return publicState(getState(eventCode));
}

function canSubmitPose(socket, code) {
  if (isAuthorizedOperator(socket, code)) return true;
  return socket.data.role === 'screen' && socket.data.eventCode === normalizeEventCode(code);
}

function finishTurn(io, code, { passed, matchValue, elapsedMs }) {
  const state = getState(code);
  clearPhaseTimer(code);

  const pose = poseById(state.poseId);
  const points = pointsFor(passed, matchValue, elapsedMs);
  const result = {
    participantId: state.currentId,
    nickname: nicknameOf(state.currentId),
    poseName: pose?.name ?? '?',
    passed,
    match: Math.round((matchValue ?? 0) * 100),
    elapsedMs,
    points,
    threshold: state.threshold,
  };

  state.lastResult = result;
  state.history.push(result);
  if (state.currentId != null) {
    if (!state.doneIds.includes(state.currentId)) state.doneIds = [...state.doneIds, state.currentId];
    if (points > 0) {
      addScore(state.currentId, points);
      state.earned.set(state.currentId, (state.earned.get(state.currentId) ?? 0) + points);
    }
  }

  // 난이도 조절 — 첫 시도가 따로 없는 게임이라 '지나간 사람들의 실패율'을 쓴다.
  // 최근 사람들만 본다: 행사 앞부분 성적이 뒤까지 끌고 가면 조절이 굼떠진다.
  const recent = state.history.slice(-6);
  const failRate = recent.length ? recent.filter((r) => !r.passed).length / recent.length : null;
  state.threshold = adjust(state.threshold, failRate, {
    step: THRESHOLD_STEP,
    min: THRESHOLD_MIN,
    max: THRESHOLD_MAX,
    sampleSize: recent.length,
    // 기준이 높아질수록 어려워진다 (색 허용 배율과 반대 방향)
    easierIsHigher: false,
  });

  state.phase = null;
  state.phaseEndsAt = null;
  state.holdStartedAt = null;
  state.live = { match: 0, best: state.live.best, holding: false };
  state.status = 'result';

  const event = getEventByCode(code);
  if (event && points > 0) broadcastScoreboard(io, code, event.id);
  broadcast(io, code);
}

function setPhase(io, code, phase, durationMs) {
  const state = getState(code);
  clearPhaseTimer(code);
  state.phase = phase;
  state.phaseEndsAt = Date.now() + durationMs;

  timers.set(
    code,
    setTimeout(() => {
      timers.delete(code);
      const s = getState(code);
      if (s.status !== 'playing') return;
      if (phase === 'ready') {
        s.startedAt = Date.now();
        s.live = { match: 0, best: 0, holding: false };
        setPhase(io, code, 'posing', ROUND_MS);
      } else {
        // 시간 종료 — 가장 닮았던 순간으로 기록을 남긴다
        finishTurn(io, code, { passed: false, matchValue: s.live.best, elapsedMs: ROUND_MS });
      }
    }, durationMs),
  );

  broadcast(io, code);
}

export function registerSilhouetteHandlers(io, socket) {
  socket.on('silhouette:setup', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'idle' && state.status !== 'ready') return reply({ ok: true });
    state.status = 'ready';
    reply({ ok: true });
    broadcast(io, code);
  });

  socket.on('silhouette:leave', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'ready') return reply({ ok: true });
    state.status = 'idle';
    state.currentId = null;
    reply({ ok: true });
    broadcast(io, code);
  });

  socket.on('silhouette:call', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status === 'playing') return reply({ ok: false, error: 'TURN_IN_PROGRESS' });

    const id = Number(payload.participantId);
    const event = getEventByCode(code);
    if (!event) return reply({ ok: false, error: 'EVENT_NOT_FOUND' });
    if (!listParticipantsByEvent(event.id).some((p) => p.id === id && p.status === 'active')) {
      return reply({ ok: false, error: 'NOT_A_PARTICIPANT' });
    }

    state.currentId = id;
    state.status = 'ready';
    state.lastResult = null;
    reply({ ok: true });
    broadcast(io, code);
  });

  socket.on('silhouette:start', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status === 'playing') return reply({ ok: false, error: 'TURN_IN_PROGRESS' });
    if (state.currentId == null) return reply({ ok: false, error: 'NOBODY_CALLED' });

    // 진행자가 고르거나, 비워두면 서버가 뽑는다 (직전 포즈는 피한다)
    const chosen = payload.poseId ? poseById(String(payload.poseId)) : pickPose(state.poseId);
    if (!chosen) return reply({ ok: false, error: 'INVALID_POSE' });

    state.poseId = chosen.id;
    state.status = 'playing';
    state.lastResult = null;
    state.holdStartedAt = null;
    state.live = { match: 0, best: 0, holding: false };

    reply({ ok: true, poseId: chosen.id });
    setPhase(io, code, 'ready', READY_MS);
  });

  /**
   * 아이패드가 보낸 관절 각도 8개.
   * 얼마나 닮았는지는 여기서 계산한다 — 아이패드가 보낸 점수는 읽지 않는다.
   */
  socket.on('silhouette:angles', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!canSubmitPose(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'playing' || state.phase !== 'posing') {
      return reply({ ok: false, error: 'NOT_POSING' });
    }

    const raw = Array.isArray(payload.angles) ? payload.angles : null;
    if (!raw || raw.length !== 8) return reply({ ok: false, error: 'INVALID_ANGLES' });
    const angles = raw.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null));

    const pose = poseById(state.poseId);
    const scored = matchScore(angles, pose);
    if (!scored) return reply({ ok: false, error: 'CANNOT_SCORE' });

    const now = Date.now();
    const hit = scored.match >= state.threshold;
    // 스쳐 지나간 한순간을 통과로 쳐주지 않는다. 잠깐이라도 유지해야 인정한다.
    if (hit) {
      if (state.holdStartedAt == null) state.holdStartedAt = now;
    } else {
      state.holdStartedAt = null;
    }
    const heldMs = state.holdStartedAt == null ? 0 : now - state.holdStartedAt;

    state.live = {
      match: scored.match,
      best: Math.max(state.live.best, scored.match),
      holding: hit,
      heldMs,
    };

    if (hit && heldMs >= HOLD_MS) {
      reply({ ok: true, match: scored.match, passed: true });
      finishTurn(io, code, {
        passed: true,
        matchValue: scored.match,
        elapsedMs: now - (state.startedAt ?? now),
      });
      return;
    }

    reply({ ok: true, match: scored.match, passed: false });
    broadcastLive(io, code);
  });

  socket.on('silhouette:skip', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'playing') return reply({ ok: false, error: 'NOT_PLAYING' });
    finishTurn(io, code, { passed: false, matchValue: state.live.best, elapsedMs: ROUND_MS });
    reply({ ok: true });
  });

  socket.on('silhouette:next', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'result') return reply({ ok: false, error: 'NOT_RESULT' });
    state.status = 'ready';
    state.currentId = null;
    reply({ ok: true });
    broadcast(io, code);
  });

  socket.on('silhouette:end', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status === 'idle' || state.status === 'ended') {
      return reply({ ok: false, error: 'NOT_RUNNING' });
    }
    clearPhaseTimer(code);

    const event = getEventByCode(code);
    if (event) {
      createGameRecord({
        eventId: event.id,
        gameType: 'silhouette',
        result: {
          played: state.history.length,
          finalThreshold: state.threshold,
          turns: state.history.map((h) => ({
            nickname: h.nickname, pose: h.poseName, passed: h.passed, match: h.match, points: h.points,
          })),
          totals: [...state.earned.entries()]
            .map(([participantId, points]) => ({ participantId, nickname: nicknameOf(participantId), points }))
            .sort((a, b) => b.points - a.points),
        },
      });
    }

    state.status = 'ended';
    state.phase = null;
    reply({ ok: true });
    broadcast(io, code);
  });

  socket.on('silhouette:reset', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    clearPhaseTimer(code);
    games.set(code, createInitialState());
    reply({ ok: true });
    broadcast(io, code);
  });
}

export { clampThreshold };
