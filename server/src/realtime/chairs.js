import { createGameRecord } from '../db/gameRecords.js';
import { getEventByCode } from '../db/events.js';
import { addScore, getParticipantById, listParticipantsByEvent } from '../db/participants.js';
import { shuffle } from '../game/acrosticEngine.js';
import {
  GRAB_WINDOW_MS,
  MIN_PARTICIPANTS,
  SPIN_DEG_PER_SEC,
  canTake,
  chairCountFor,
  pickSpinMs,
  resolveRound,
} from '../game/chairsEngine.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode } from './rooms.js';
import { broadcastScoreboard } from './scoreboard.js';

// 의자 빨리 뺏기 실시간 상태 (maze.js/yabawi.js 와 같은 구조).
//
// 두 가지가 중요하다:
//  1) 호루라기가 언제 울릴지는 미리 안 알려준다. spinStartedAt 만 내려보내 화면이
//     돌아가게 하고, 울리는 순간에야 grabbing 으로 바꾼다. 미리 보내면 그 시각에
//     맞춰 자동으로 누르는 게 가능해진다.
//  2) 앉는 순서는 서버 도착 순서로 정한다. 먼저 도착한 요청이 그 의자를 가진다.
//
// 마지막 라운드(의자 1개)만 빼면 자기 양옆 의자만 잡을 수 있다 — chairsEngine 의
// canTake 가 매 요청마다 검사한다. 화면에 안 보이는 의자를 조작해서 눌러도 막힌다.

const games = new Map(); // eventCode -> ChairsGameState
const timers = new Map(); // eventCode -> { whistle, grabEnd }

const WIN_POINTS = 150; // 최후의 1인
const SURVIVE_POINTS = 20; // 라운드를 넘길 때마다

function createInitialState() {
  return {
    status: 'idle', // idle | spinning | grabbing | result | ended
    round: 0,
    activePool: [], // 이번 라운드 참가자 (원에 선 순서 = 이 배열 순서)
    eliminatedIds: [],
    chairCount: 0,
    spinStartedAt: null,
    freezeAngle: null, // 호루라기가 울린 순간의 회전 각도
    grabEndsAt: null,
    seatOf: new Map(), // participantId -> 의자 번호
    takenBy: new Map(), // 의자 번호 -> participantId
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
  if (t.whistle) clearTimeout(t.whistle);
  if (t.grabEnd) clearTimeout(t.grabEnd);
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
    chairCount: state.chairCount,
    // 원에 선 순서 그대로 — 화면은 이 순서로 닉네임을 배치하고,
    // 각자는 여기서 자기 자리 번호(angleIndex)를 찾아 근처 의자를 계산한다.
    players: state.activePool.map((id, i) => ({ ...toRef(id), participantId: id, angleIndex: i })),
    eliminatedIds: state.eliminatedIds,
    spinStartedAt: state.spinStartedAt,
    spinDegPerSec: SPIN_DEG_PER_SEC,
    // 호루라기가 울리기 전에는 null — 언제 울릴지 미리 알려주지 않는다
    freezeAngle: state.status === 'spinning' ? null : state.freezeAngle,
    grabEndsAt: state.grabEndsAt,
    serverNow: Date.now(),
    taken: [...state.takenBy.entries()].map(([chairIndex, id]) => ({
      chairIndex,
      ...toRef(id),
      participantId: id,
    })),
    result: state.lastResult
      ? {
          outcome: state.lastResult.outcome,
          survivors: state.lastResult.survivors.map(toRef),
          eliminated: state.lastResult.eliminated.map(toRef),
        }
      : null,
  };
}

function broadcastNow(io, code) {
  io.to(eventRoom(code)).emit('chairs:state', publicState(getState(code)));
}

export function getChairsSnapshot(eventCode) {
  return publicState(getState(eventCode));
}

/** 재접속 시 이 참가자가 이번 라운드에 앉은 의자를 되살린다. */
export function getYourChairsSeat(eventCode, participantId) {
  const state = getState(eventCode);
  return state.seatOf.has(participantId) ? state.seatOf.get(participantId) : null;
}

/** 앉기 시간이 끝났거나 의자가 다 찼을 때 라운드를 닫는다. */
function endGrab(io, code) {
  const state = getState(code);
  if (state.status !== 'grabbing') return;
  clearTimers(code);

  state.lastResult = resolveRound(state.activePool, state.seatOf);
  state.status = 'result';
  broadcastNow(io, code);
}

export function registerChairsHandlers(io, socket) {
  socket.on('chairs:start', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status === 'spinning' || state.status === 'grabbing') {
      return reply({ ok: false, error: 'ROUND_IN_PROGRESS' });
    }

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

    // 매 라운드 서는 자리를 섞는다 — 같은 사람 옆에 계속 서면 재미가 없다
    state.activePool = shuffle(pool);
    state.round += 1;
    state.chairCount = chairCountFor(state.activePool.length);
    state.status = 'spinning';
    state.spinStartedAt = Date.now();
    state.freezeAngle = null;
    state.grabEndsAt = null;
    state.seatOf = new Map();
    state.takenBy = new Map();
    state.lastResult = null;

    reply({ ok: true });
    broadcastNow(io, code);

    clearTimers(code);
    const spinMs = pickSpinMs();
    const whistle = setTimeout(() => {
      const cur = getState(code);
      if (cur.status !== 'spinning') return;
      // 화면이 그려온 회전과 같은 값을 써야 멈추는 순간이 어긋나지 않는다
      cur.freezeAngle = (spinMs / 1000) * SPIN_DEG_PER_SEC;
      cur.status = 'grabbing';
      cur.grabEndsAt = Date.now() + GRAB_WINDOW_MS;
      broadcastNow(io, code);

      const grabEnd = setTimeout(() => endGrab(io, code), GRAB_WINDOW_MS);
      timers.set(code, { grabEnd });
    }, spinMs);
    timers.set(code, { whistle });
  });

  socket.on('chairs:sit', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (
      socket.data.role !== 'player' ||
      !socket.data.participantId ||
      socket.data.eventCode !== code
    ) {
      return reply({ ok: false, error: 'FORBIDDEN' });
    }

    const state = getState(code);
    if (state.status !== 'grabbing') return reply({ ok: false, error: 'NOT_GRABBING' });

    const id = socket.data.participantId;
    const playerIndex = state.activePool.indexOf(id);
    if (playerIndex === -1) return reply({ ok: false, error: 'NOT_IN_ROUND' });
    if (state.seatOf.has(id)) return reply({ ok: false, error: 'ALREADY_SEATED' });

    const chairIndex = Number(payload.chairIndex);
    // 화면에 안 보이는 의자를 눌러도 여기서 막힌다 (근처 의자 규칙)
    if (!canTake(playerIndex, state.activePool.length, state.freezeAngle, state.chairCount, chairIndex)) {
      return reply({ ok: false, error: 'TOO_FAR' });
    }

    // 먼저 도착한 사람이 가진다. 이미 찼으면 거부하되, 옆 의자는 다시 노려볼 수 있다.
    if (state.takenBy.has(chairIndex)) return reply({ ok: false, error: 'CHAIR_TAKEN' });

    state.takenBy.set(chairIndex, id);
    state.seatOf.set(id, chairIndex);
    reply({ ok: true, chairIndex });

    // 의자가 다 찼으면 남은 시간을 기다리지 않는다
    if (state.takenBy.size >= state.chairCount) endGrab(io, code);
    else broadcastNow(io, code);
  });

  // 다음 라운드로 (또는 게임 종료 처리)
  socket.on('chairs:advance', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'result' || !state.lastResult) return reply({ ok: false, error: 'NOT_RESULT' });

    const { outcome, survivors, eliminated } = state.lastResult;
    const event = getEventByCode(code);

    if (outcome === 'wipeout') {
      // 아무도 안 앉았다 — 무효로 하고 같은 인원으로 다시 (판 수도 되돌린다)
      state.round -= 1;
      state.status = 'idle';
      reply({ ok: true });
      broadcastNow(io, code);
      return;
    }

    if (event) {
      // 라운드를 넘긴 사람에게 생존 점수, 최후의 1인에게 우승 점수
      survivors.forEach((id) => addScore(id, outcome === 'ended' ? WIN_POINTS : SURVIVE_POINTS));
      broadcastScoreboard(io, code, event.id);
    }

    state.eliminatedIds = [...state.eliminatedIds, ...eliminated];
    state.activePool = survivors;

    if (outcome === 'ended') {
      if (event) {
        createGameRecord({
          eventId: event.id,
          gameType: 'chairs',
          result: {
            rounds: state.round,
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

  socket.on('chairs:reset', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    clearTimers(code);
    games.set(code, createInitialState());
    reply({ ok: true });
    broadcastNow(io, code);
  });
}
