import { createGameRecord } from '../db/gameRecords.js';
import { getEventByCode } from '../db/events.js';
import { addScore, getParticipantById, listParticipantsByEvent } from '../db/participants.js';
import { shuffle } from '../game/acrosticEngine.js';
import {
  DOLL_POST,
  MIN_PARTICIPANTS,
  RED_MS,
  SPRINT_MS,
  clampPos,
  lastToArrive,
  movedOnRed,
  pointsFor,
  reachedDoll,
  reachedHome,
  resolveRound,
  rollChant,
  strictnessById,
} from '../game/mugunghwaEngine.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode, roleRoom } from './rooms.js';
import { broadcastScoreboard } from './scoreboard.js';

// '무궁화꽃이 피었습니다' 실시간 상태 (maze.js 와 같은 구조).
//
// 영희는 사람이 맡지 않는다. 서버가 자동으로 돌린다 — 그래야 전원이 주자가 되고,
// "누가 영희 할래요"로 시작 전에 시간을 쓰지 않는다. 대신 구호 속도를 매번 바꿔서
// 박자를 못 외우게 한다. 돌아보는 타이밍은 사람이 정한다 — 빨리 돌았다 늦게 돌았다 속이는 게
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
    activePool: [], // 이번 라운드 주자 (전원이 주자다 — 영희는 사람이 아니다)
    eliminatedIds: [],
    readyIds: [], // 모션 센서 허용을 마친 사람
    green: true, // 영희가 등을 돌리고 있는가 (판은 등을 돌린 채로 시작한다)
    lightChangedAt: null,
    chantRate: 1, // 이번 구호를 읽을 속도 (매번 달라진다)
    chantEndsAt: null, // 구호가 끝나고 영희가 돌아볼 시각
    redSince: null, // 빨간불이 된 시각 (유예 시간 계산용)
    positions: new Map(), // participantId -> 0(출발선)~1(영희)
    caught: new Set(), // 빨간불에 움직여 잡힌 사람
    home: new Set(), // 출발선으로 돌아온 사람
    homeAt: new Map(), // participantId -> 출발선 도착 시각 (꼴찌를 가리는 기준)
    toucherId: null, // 영희를 처음 터치한 사람
    sprintStartedAt: null,
    sprintEndsAt: null,
    dollPos: DOLL_POST, // 영희는 제자리를 지킨다
    caughtByDoll: new Set(), // 영희에게 잡힌 사람 (꼴찌)
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
  if (t.light) clearTimeout(t.light);
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
    green: state.green,
    lightChangedAt: state.lightChangedAt,
    // 화면이 이 속도로 구호를 읽는다. 불이 바뀌는 시각은 서버가 쥐고 있고,
    // 말은 거기에 맞춰 따라올 뿐이다.
    chantRate: state.chantRate,
    chantEndsAt: state.chantEndsAt,
    sprintStartedAt: state.sprintStartedAt,
    sprintEndsAt: state.sprintEndsAt,
    dollPos: state.dollPos,
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

/**
 * 위치 중계 — 대형화면에만 보낸다.
 * 전원에게 뿌리면 12Hz × 인원수가 되고, 주자 폰은 자기 위치만 알면 된다.
 */
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

/**
 * 영희를 자동으로 돌린다.
 *
 * 등을 돌린 채로 구호를 읽고(초록불), 구호가 끝나면 홱 돌아본다(빨간불).
 * 구호 길이를 매번 새로 뽑기 때문에 박자를 외울 수 없다 — 그게 이 게임의 긴장이다.
 * 화면은 서버가 내려준 속도로 읽기만 하고, 불이 바뀌는 시각은 여기서만 정한다.
 */
function scheduleLight(io, code) {
  const state = getState(code);
  if (state.status !== 'approaching') return;

  const t = timers.get(code) ?? {};
  if (t.light) clearTimeout(t.light);

  if (state.green) {
    // 등을 돌리고 구호를 읽는 중 — 끝나면 돌아본다
    const chant = rollChant();
    state.chantRate = chant.rate;
    state.chantEndsAt = Date.now() + chant.ms;
    state.lightChangedAt = Date.now();
    t.light = setTimeout(() => {
      const cur = getState(code);
      if (cur.status !== 'approaching') return;
      cur.green = false;
      cur.redSince = Date.now();
      cur.lightChangedAt = cur.redSince;
      cur.chantEndsAt = null;
      broadcastNow(io, code);
      scheduleLight(io, code);
    }, chant.ms);
  } else {
    // 돌아본 채로 노려보는 중 — 이 길이는 흔들지 않는다
    t.light = setTimeout(() => {
      const cur = getState(code);
      if (cur.status !== 'approaching') return;
      cur.green = true;
      cur.redSince = null;
      broadcastNow(io, code);
      scheduleLight(io, code);
    }, RED_MS);
  }

  timers.set(code, t);
  broadcastNow(io, code);
}

function endRound(io, code) {
  const state = getState(code);
  if (state.status !== 'approaching' && state.status !== 'sprinting') return;
  clearTimers(code);

  // 도망까지 간 판에서는 **가장 늦게 들어온 한 명**을 영희가 잡는다 (운영 결정).
  // 빨간불에 이미 잡힌 사람은 후보에서 뺀다 — 두 번 잡을 수는 없다.
  if (state.status === 'sprinting') {
    const alive = state.activePool.filter((id) => !state.caught.has(id));
    const last = lastToArrive(alive, state.homeAt, state.positions);
    if (last != null) {
      state.caught.add(last);
      state.caughtByDoll.add(last);
      state.home.delete(last); // 들어왔더라도 꼴찌면 문 앞에서 잡힌 셈이다
    }
  }

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
  state.dollPos = DOLL_POST;
  broadcastNow(io, code);

  const t = timers.get(code) ?? {};
  if (t.sprint) clearTimeout(t.sprint);
  t.sprint = setTimeout(() => endRound(io, code), SPRINT_MS);
  timers.set(code, t);
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

    // 영희는 사람이 맡지 않는다 — 전원이 주자다.
    state.activePool = shuffle(pool);
    state.round += 1;
    state.strictness = strictness.id;
    state.status = 'approaching';
    // 영희는 **등을 돌린 채로 시작한다**. 돌아본 채로 시작하면 출발 신호를 기다리는
    // 멈춘 시간부터 생겨서, 판이 열리자마자 달릴 수 있는 지금이 훨씬 시원하다.
    state.green = true;
    state.lightChangedAt = Date.now();
    state.redSince = null;
    state.positions = new Map(state.activePool.map((id) => [id, 0]));
    state.caught = new Set();
    state.home = new Set();
    state.homeAt = new Map();
    state.toucherId = null;
    state.sprintStartedAt = null;
    state.sprintEndsAt = null;
    state.dollPos = DOLL_POST;
    state.caughtByDoll = new Set();
    state.lastResult = null;

    reply({ ok: true });

    clearTimers(code);
    timers.set(code, { positions: setInterval(() => broadcastPositions(io, code), POSITION_MS) });
    scheduleLight(io, code); // 구호를 읽기 시작한다 (broadcastNow 도 여기서 한다)
  });

  /** 폰이 12Hz 로 보고하는 내 위치와 흔들림 세기. */
  socket.on('mugunghwa:pos', (payload = {}) => {
    const code = normalizeEventCode(payload.eventCode);
    if (socket.data.role !== 'player' || !socket.data.participantId || socket.data.eventCode !== code) return;

    const state = getState(code);
    if (state.status !== 'approaching' && state.status !== 'sprinting') return;

    const id = socket.data.participantId;
    if (!state.positions.has(id)) return; // 이번 판 주자가 아니다 (탈락자)
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
      // 도착 시각을 남긴다 — 이게 나중에 꼴찌를 가리는 기준이 된다.
      // 영희는 쫓아오지 않는다. 누가 잡히는지는 판이 끝날 때 한 번에 정해진다.
      state.home.add(id);
      state.homeAt.set(id, Date.now());
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
