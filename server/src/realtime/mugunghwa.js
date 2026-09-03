import { createGameRecord } from '../db/gameRecords.js';
import { getEventByCode } from '../db/events.js';
import { addScore, getParticipantById, listParticipantsByEvent } from '../db/participants.js';
import { shuffle } from '../game/acrosticEngine.js';
import {
  DOLL_START_POS,
  MIN_PARTICIPANTS,
  SPRINT_MS,
  canChaseYet,
  clampPos,
  dollPoints,
  movedOnRed,
  overtaken,
  pickDoll,
  pointsFor,
  reachedDoll,
  reachedHome,
  resolveRound,
  sprintStep,
  strictnessById,
} from '../game/mugunghwaEngine.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode, roleRoom } from './rooms.js';
import { broadcastScoreboard } from './scoreboard.js';

// '무궁화꽃이 피었습니다' 실시간 상태 (maze.js 와 같은 구조).
//
// 영희는 진행자가 직접 맡거나, 참가자 중 한 명을 뽑는다. 어느 쪽이든 등을 돌리고
// 돌아보는 타이밍은 사람이 직접 정한다 — 빨리 돌았다 늦게 돌았다 속이는 게
// 이 놀이의 핵심이라, 자동으로 돌리면 재미가 없다 (운영 결정).
//
// 위치는 각 폰이 계산해서 12Hz 로 보고하고(미로와 같은 방식), 서버는 그걸 모아
// 대형화면에만 중계하면서 빨간불 위반과 도착을 판정한다.

const games = new Map(); // eventCode -> state
const timers = new Map(); // eventCode -> { sprint, positions }

const POSITION_MS = 80; // 대형화면 중계 간격 (약 12Hz)

function createInitialState() {
  return {
    status: 'idle', // idle | ready | approaching | sprinting | result | ended
    round: 0,
    strictness: 'normal',
    dollId: null, // 참가자가 영희면 그 id, 진행자가 영희면 null
    activePool: [], // 이번 라운드 주자 (영희는 빠진다)
    eliminatedIds: [],
    readyIds: [], // 모션 센서 허용을 마친 사람
    green: true, // 영희가 등을 돌리고 있는가
    lightChangedAt: null,
    redSince: null, // 빨간불이 된 시각 (유예 시간 계산용)
    positions: new Map(), // participantId -> 0(출발선)~1(영희)
    caught: new Set(), // 빨간불에 움직여 잡힌 사람
    home: new Set(), // 출발선으로 돌아온 사람
    toucherId: null, // 영희를 처음 터치한 사람
    sprintStartedAt: null,
    sprintEndsAt: null,
    dollPos: DOLL_START_POS, // 도망 구간에서 영희가 쫓아온 위치
    caughtByDoll: new Set(), // 영희가 추월해서 잡은 사람 (점수 계산용)
    lastResult: null,
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

function clearTimers(code) {
  const t = timers.get(code);
  if (!t) return;
  if (t.sprint) clearTimeout(t.sprint);
  if (t.positions) clearInterval(t.positions);
  timers.delete(code);
}

function toRef(id) {
  const p = getParticipantById(id);
  return p ? { id: p.id, nickname: p.nickname } : { id, nickname: '알 수 없음' };
}

function publicState(state) {
  return {
    status: state.status,
    round: state.round,
    strictness: state.strictness,
    doll: state.dollId != null ? toRef(state.dollId) : null,
    dollId: state.dollId,
    green: state.green,
    lightChangedAt: state.lightChangedAt,
    sprintStartedAt: state.sprintStartedAt,
    sprintEndsAt: state.sprintEndsAt,
    dollPos: state.dollPos,
    dollCatchCount: state.caughtByDoll.size,
    serverNow: Date.now(),
    // 주자 명단 — 화면이 사람 모양을 그리고, 각자는 여기서 자기 색을 찾는다
    runners: state.activePool.map((id, i) => ({
      ...toRef(id),
      participantId: id,
      colorIndex: i,
      caught: state.caught.has(id),
      // 빨간불에 움직여 잡힌 것과 영희에게 쫓겨 잡힌 것을 구분해서 보여준다
      caughtByDoll: state.caughtByDoll.has(id),
      home: state.home.has(id),
    })),
    eliminatedIds: state.eliminatedIds,
    readyIds: state.readyIds,
    toucher: state.toucherId != null ? toRef(state.toucherId) : null,
    result: state.lastResult
      ? {
          outcome: state.lastResult.outcome,
          survivors: state.lastResult.survivors.map(toRef),
          eliminated: state.lastResult.eliminated.map(toRef),
          toucher: state.toucherId != null ? toRef(state.toucherId) : null,
        }
      : null,
  };
}

function broadcastNow(io, code) {
  io.to(eventRoom(code)).emit('mugunghwa:state', publicState(getState(code)));
}

/** 위치는 대형화면에만 보낸다 (참여자 폰은 자기 것만 보므로 받을 이유가 없다). */
function broadcastPositions(io, code) {
  const state = getState(code);
  if (state.status !== 'approaching' && state.status !== 'sprinting') return;

  io.to(roleRoom(code, 'screen')).emit('mugunghwa:positions', {
    at: Date.now(),
    dollPos: state.dollPos,
    runners: state.activePool.map((id) => ({
      participantId: id,
      pos: state.positions.get(id) ?? 0,
      caught: state.caught.has(id),
      home: state.home.has(id),
    })),
  });
}

export function getMugunghwaSnapshot(eventCode) {
  return publicState(getState(eventCode));
}

/** 재접속 시 이 참가자의 현재 위치를 되살린다. */
export function getYourMugunghwaPos(eventCode, participantId) {
  const state = getState(eventCode);
  return state.positions.has(participantId) ? state.positions.get(participantId) : null;
}

/**
 * 더 지켜볼 사람이 없으면(전원 잡혔거나 들어왔으면) 제한시간을 기다리지 않는다.
 * 예전에는 '전원 복귀'만 봐서, 잡힌 사람이 섞이면 10초를 멍하니 기다렸다.
 */
function endIfSettled(io, code) {
  const state = getState(code);
  if (state.status !== 'sprinting') return;
  const done = state.activePool.filter((id) => state.caught.has(id) || state.home.has(id)).length;
  if (done >= state.activePool.length) endRound(io, code);
}

function endRound(io, code) {
  const state = getState(code);
  if (state.status !== 'approaching' && state.status !== 'sprinting') return;
  clearTimers(code);
  state.lastResult = resolveRound(state.activePool, state.caught, state.home);
  state.status = 'result';
  broadcastNow(io, code);
}

/** 누군가 영희를 터치했다 — 전원이 몸을 돌려 출발선으로 달린다. */
function startSprint(io, code, toucherId) {
  const state = getState(code);
  if (state.status !== 'approaching') return;

  state.toucherId = toucherId;
  state.status = 'sprinting';
  state.green = true; // 더 이상 빨간불은 없다 (도망치는 구간)
  state.redSince = null;
  state.sprintStartedAt = Date.now();
  state.sprintEndsAt = state.sprintStartedAt + SPRINT_MS;
  state.dollPos = DOLL_START_POS;
  broadcastNow(io, code);

  const t = timers.get(code) ?? {};
  if (t.sprint) clearTimeout(t.sprint);
  t.sprint = setTimeout(() => endRound(io, code), SPRINT_MS);
  timers.set(code, t);
}

/** 영희가 이 소켓의 주인인지 (참가자 영희 또는 진행자 영희). */
function isDoll(socket, state, code) {
  if (state.dollId == null) return isAuthorizedOperator(socket, code);
  return socket.data.role === 'player' && socket.data.participantId === state.dollId;
}

export function registerMugunghwaHandlers(io, socket) {
  // 진행자가 이 게임을 펼치면 참가자 폰에 '움직임 감지 허용' 버튼을 띄운다
  socket.on('mugunghwa:prepare', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status !== 'idle') return reply({ ok: true });
    state.status = 'ready';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('mugunghwa:unprepare', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status !== 'ready') return reply({ ok: true });
    state.status = 'idle';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('mugunghwa:ready', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (socket.data.role !== 'player' || !socket.data.participantId || socket.data.eventCode !== code) {
      return reply({ ok: false, error: 'FORBIDDEN' });
    }
    const state = getState(code);
    const id = socket.data.participantId;
    if (state.readyIds.includes(id)) return reply({ ok: true });
    state.readyIds = [...state.readyIds, id];
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('mugunghwa:start', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status === 'approaching' || state.status === 'sprinting') {
      return reply({ ok: false, error: 'ROUND_IN_PROGRESS' });
    }

    const strictness = strictnessById(String(payload.strictness ?? ''));
    if (!strictness) return reply({ ok: false, error: 'INVALID_STRICTNESS' });

    const event = getEventByCode(code);
    if (!event) return reply({ ok: false, error: 'EVENT_NOT_FOUND' });

    // 2라운드부터는 살아남은 사람들끼리 이어서 한다
    let pool = state.round > 0 && state.activePool.length > 0 ? state.activePool : null;
    if (!pool) {
      const active = listParticipantsByEvent(event.id).filter((p) => p.status === 'active');
      if (active.length < MIN_PARTICIPANTS) {
        return reply({ ok: false, error: 'NOT_ENOUGH_PARTICIPANTS' });
      }
      pool = active.map((p) => p.id);
      state.eliminatedIds = [];
    }

    // 영희를 정한다: 'operator' 면 진행자가 직접, 'random' 이면 참가자 중 한 명.
    // 참가자가 영희를 맡으면 그 사람은 이번 판 주자에서 빠진다.
    const mode = payload.dollMode === 'random' ? 'random' : 'operator';
    let dollId = null;
    if (mode === 'random') {
      // 영희 1명 + 주자 최소 1명
      if (pool.length < 2) {
        return reply({ ok: false, error: 'NOT_ENOUGH_FOR_RANDOM_DOLL' });
      }
      dollId = pickDoll(pool);
    }

    state.dollId = dollId;
    state.activePool = shuffle(pool.filter((id) => id !== dollId));
    state.round += 1;
    state.strictness = strictness.id;
    state.status = 'approaching';
    state.green = false; // 영희가 돌아본 채로 시작한다 — 영희가 등을 돌려야 출발
    state.lightChangedAt = Date.now();
    state.redSince = Date.now();
    state.positions = new Map(state.activePool.map((id) => [id, 0]));
    state.caught = new Set();
    state.home = new Set();
    state.toucherId = null;
    state.sprintStartedAt = null;
    state.sprintEndsAt = null;
    state.dollPos = DOLL_START_POS;
    state.caughtByDoll = new Set();
    state.lastResult = null;

    reply({ ok: true });
    broadcastNow(io, code);

    clearTimers(code);
    timers.set(code, { positions: setInterval(() => broadcastPositions(io, code), POSITION_MS) });
  });

  /** 영희가 등을 돌리거나(초록) 돌아본다(빨강). */
  socket.on('mugunghwa:light', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    const state = getState(code);
    if (!isDoll(socket, state, code)) return reply({ ok: false, error: 'NOT_DOLL' });
    if (state.status !== 'approaching') return reply({ ok: false, error: 'NOT_APPROACHING' });

    const green = Boolean(payload.green);
    if (green === state.green) return reply({ ok: true });

    state.green = green;
    state.lightChangedAt = Date.now();
    state.redSince = green ? null : Date.now();
    reply({ ok: true });
    broadcastNow(io, code);
  });

  /**
   * 폰이 자기 위치와 흔들림을 알린다 (초당 12번쯤).
   * ack 를 돌려주지 않는다 — 왕복이 그 자체로 부담이고, 한 번쯤 빠져도 곧 다음 게 온다.
   */
  socket.on('mugunghwa:pos', (payload = {}) => {
    const code = normalizeEventCode(payload.eventCode);
    if (socket.data.role !== 'player' || !socket.data.participantId || socket.data.eventCode !== code) return;

    const state = getState(code);
    if (state.status !== 'approaching' && state.status !== 'sprinting') return;

    const id = socket.data.participantId;
    if (!state.positions.has(id)) return; // 이번 판 주자가 아니다 (영희이거나 탈락자)
    if (state.caught.has(id) || state.home.has(id)) return; // 이미 끝난 사람

    const pos = clampPos(payload.pos);
    state.positions.set(id, pos);

    if (state.status === 'approaching') {
      // 빨간불에 움직였는가
      const threshold = strictnessById(state.strictness).moveThreshold;
      if (!state.green && movedOnRed(payload.shake, threshold, state.redSince, Date.now())) {
        state.caught.add(id);
        broadcastNow(io, code);
        return;
      }
      // 영희에게 닿았는가 — 처음 닿은 사람이 2단계를 연다
      if (state.toucherId == null && reachedDoll(pos)) {
        startSprint(io, code, id);
        return;
      }
    } else if (reachedHome(pos)) {
      state.home.add(id);
      broadcastNow(io, code);
      endIfSettled(io, code);
    } else if (overtaken(state.dollPos, pos)) {
      // 영희가 이미 지나쳐 간 자리에 있다 — 뒤늦게 보고가 와도 잡는다
      state.caught.add(id);
      state.caughtByDoll.add(id);
      broadcastNow(io, code);
      endIfSettled(io, code);
    }
  });

  /**
   * 영희가 쫓아온다 — 도망 구간에서만.
   * 두드린 만큼 출발선 쪽으로 나아가고, 지나친 주자는 모두 잡힌다.
   * 진행자가 영희일 때도 같은 규칙이라 어느 쪽이든 설명이 같다.
   */
  socket.on('mugunghwa:chase', (payload = {}) => {
    const code = normalizeEventCode(payload.eventCode);
    const state = getState(code);
    if (!isDoll(socket, state, code)) return;
    if (state.status !== 'sprinting') return;
    // 몸을 돌리는 시간 — 이게 없으면 터치한 사람이 한 번의 두드림에 바로 잡힌다
    if (!canChaseYet(state.sprintStartedAt, Date.now())) return;

    const step = sprintStep(payload.taps);
    if (step <= 0) return;

    state.dollPos = clampPos(state.dollPos - step);

    let caughtNow = false;
    state.activePool.forEach((id) => {
      if (state.caught.has(id) || state.home.has(id)) return;
      const pos = state.positions.get(id) ?? 0;
      if (overtaken(state.dollPos, pos)) {
        state.caught.add(id);
        state.caughtByDoll.add(id);
        caughtNow = true;
      }
    });

    if (caughtNow) {
      broadcastNow(io, code);
      endIfSettled(io, code);
    }
  });

  /** 진행자가 라운드를 중간에 끊는다 (아무도 영희에게 못 갈 때 등). */
  socket.on('mugunghwa:stop', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status !== 'approaching' && state.status !== 'sprinting') {
      return reply({ ok: false, error: 'NOT_RUNNING' });
    }
    endRound(io, code);
    reply({ ok: true });
  });

  socket.on('mugunghwa:advance', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'result' || !state.lastResult) return reply({ ok: false, error: 'NOT_RESULT' });

    const { outcome, survivors, eliminated } = state.lastResult;
    const event = getEventByCode(code);

    if (outcome === 'wipeout') {
      state.round -= 1;
      state.status = 'idle';
      reply({ ok: true });
      broadcastNow(io, code);
      return;
    }

    if (event) {
      // 영희를 터치한 사람은 탈락했어도 보너스를 받는다 — 위험을 무릅쓴 대가다
      const scored = new Set([...survivors, ...(state.toucherId != null ? [state.toucherId] : [])]);
      scored.forEach((id) => {
        const points = pointsFor({
          outcome,
          survived: survivors.includes(id),
          touchedDoll: id === state.toucherId,
        });
        if (points > 0) addScore(id, points);
      });
      // 영희도 잡은 사람 수만큼 받는다 (참가자가 영희일 때만 — 진행자는 점수가 없다)
      if (state.dollId != null) {
        const dp = dollPoints(state.caughtByDoll.size);
        if (dp > 0) addScore(state.dollId, dp);
      }
      broadcastScoreboard(io, code, event.id);
    }

    state.eliminatedIds = [...state.eliminatedIds, ...eliminated];
    state.activePool = survivors;

    if (outcome === 'ended') {
      if (event) {
        createGameRecord({
          eventId: event.id,
          gameType: 'mugunghwa',
          result: {
            rounds: state.round,
            strictness: state.strictness,
            winners: survivors.map(toRef),
            eliminated: state.eliminatedIds.map(toRef),
          },
        });
      }
      state.status = 'ended';
    } else {
      state.status = 'idle';
    }

    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('mugunghwa:reset', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    clearTimers(code);
    games.set(code, createInitialState());
    reply({ ok: true });
    broadcastNow(io, code);
  });
}
