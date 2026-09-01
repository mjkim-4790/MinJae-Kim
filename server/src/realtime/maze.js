import { createGameRecord } from '../db/gameRecords.js';
import { getEventByCode } from '../db/events.js';
import { addScore, getParticipantById, listParticipantsByEvent } from '../db/participants.js';
import {
  COUNTDOWN_MS,
  controlById,
  mazeAt,
  pickMazeIndex,
  rankFinishers,
  timeLimitById,
} from '../game/mazeEngine.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode } from './rooms.js';
import { broadcastScoreboard } from './scoreboard.js';

// 미로 찾기 실시간 상태 (yabawi.js 와 같은 구조).
//
// 핵심 두 가지:
//  1) 기록은 서버가 잰다. 참여자가 보낸 시간을 믿지 않고, 출발 시각과 완주 신호가
//     도착한 시각의 차이로 계산한다. 그래야 순위가 공정하다.
//  2) 시각은 서버 시계 기준으로 내려보낸다(startsAt/endsAt + serverNow). 각 폰의
//     시계가 제각각이라, 클라이언트는 serverNow 로 오차를 보정해서 카운트다운을 센다.
//     그래야 "3초 뒤 동시 출발"이 모든 폰에서 같은 순간이 된다.

const games = new Map(); // eventCode -> MazeGameState
const timers = new Map(); // eventCode -> { toRacing, toFinish }

const MIN_PARTICIPANTS = 1; // 운영자가 혼자 리허설할 수 있어야 한다

function createInitialState() {
  return {
    status: 'idle', // idle | countdown | racing | finished | result | ended
    control: null, // 'tilt' | 'buttons' — 진행자가 정해 전원 동일 조건
    limitMs: 0,
    mazeIndex: null,
    startsAt: null, // 카운트다운이 끝나고 실제로 출발하는 시각
    endsAt: null,
    activePool: [],
    finishes: new Map(), // participantId -> 걸린 시간(ms)
    ranking: null, // 결과 공개 때 계산
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
  if (t.toRacing) clearTimeout(t.toRacing);
  if (t.toFinish) clearTimeout(t.toFinish);
  timers.delete(code);
}

function toParticipantRef(id) {
  const p = getParticipantById(id);
  return p ? { id: p.id, nickname: p.nickname } : { id, nickname: '알 수 없음' };
}

function publicState(state) {
  const revealed = state.status === 'result' || state.status === 'ended';

  return {
    status: state.status,
    control: state.control,
    limitMs: state.limitMs,
    // 미로 자체는 출발 전부터 내려준다 — 각 폰이 미리 그려두고 카운트다운을 봐야
    // 0초에 바로 굴릴 수 있다.
    maze: state.mazeIndex != null ? mazeAt(state.mazeIndex) : null,
    startsAt: state.startsAt,
    endsAt: state.endsAt,
    serverNow: Date.now(), // 각 폰이 시계 오차를 보정하는 기준
    activeParticipantIds: state.activePool,
    // 경기 중에는 "누가 들어왔는지"만 보여준다 (기록은 결과 공개 때 한꺼번에).
    finishedParticipantIds: [...state.finishes.keys()],
    ranking: revealed && state.ranking
      ? state.ranking.map((r) => ({ ...toParticipantRef(r.participantId), ...r }))
      : null,
  };
}

function broadcastNow(io, code) {
  io.to(eventRoom(code)).emit('maze:state', publicState(getState(code)));
}

export function getMazeSnapshot(eventCode) {
  return publicState(getState(eventCode));
}

/** 재접속 시 이 참여자가 이미 완주했는지 되살린다. */
export function getYourMazeFinish(eventCode, participantId) {
  const state = getState(eventCode);
  return state.finishes.has(participantId) ? state.finishes.get(participantId) : null;
}

/** 제한시간이 끝났거나 전원이 완주했을 때 경기를 닫는다. */
function finishRace(io, code) {
  const state = getState(code);
  if (state.status !== 'racing') return;
  clearTimers(code);
  state.status = 'finished';
  broadcastNow(io, code);
}

export function registerMazeHandlers(io, socket) {
  socket.on('maze:start', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status === 'countdown' || state.status === 'racing') {
      return reply({ ok: false, error: 'RACE_IN_PROGRESS' });
    }

    const control = controlById(String(payload.control ?? ''));
    if (!control) return reply({ ok: false, error: 'INVALID_CONTROL' });

    const limit = timeLimitById(payload.limitSec);
    if (!limit) return reply({ ok: false, error: 'INVALID_LIMIT' });

    const event = getEventByCode(code);
    if (!event) return reply({ ok: false, error: 'EVENT_NOT_FOUND' });

    const active = listParticipantsByEvent(event.id).filter((p) => p.status === 'active');
    if (active.length < MIN_PARTICIPANTS) return reply({ ok: false, error: 'NOT_ENOUGH_PARTICIPANTS' });

    clearTimers(code);
    const now = Date.now();
    state.status = 'countdown';
    state.control = control.id;
    state.limitMs = limit.id * 1000;
    state.mazeIndex = pickMazeIndex();
    state.startsAt = now + COUNTDOWN_MS;
    state.endsAt = now + COUNTDOWN_MS + state.limitMs;
    state.activePool = active.map((p) => p.id);
    state.finishes = new Map();
    state.ranking = null;

    reply({ ok: true });
    broadcastNow(io, code);

    // 클라이언트 보고를 기다리지 않고 서버가 스스로 넘어간다 (야바위와 같은 방식).
    const toRacing = setTimeout(() => {
      const cur = getState(code);
      if (cur.status !== 'countdown') return;
      cur.status = 'racing';
      broadcastNow(io, code);
    }, COUNTDOWN_MS);

    const toFinish = setTimeout(() => finishRace(io, code), COUNTDOWN_MS + state.limitMs);
    timers.set(code, { toRacing, toFinish });
  });

  socket.on('maze:finish', (payload = {}, ack) => {
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
    if (state.status !== 'racing') return reply({ ok: false, error: 'NOT_RACING' });

    const id = socket.data.participantId;
    if (!state.activePool.includes(id)) return reply({ ok: false, error: 'NOT_IN_RACE' });
    if (state.finishes.has(id)) return reply({ ok: false, error: 'ALREADY_FINISHED' });

    // 걸린 시간은 서버가 잰다 (클라이언트가 보낸 값은 쓰지 않는다)
    const elapsedMs = Math.max(0, Date.now() - state.startsAt);
    state.finishes.set(id, elapsedMs);

    reply({ ok: true, elapsedMs });

    // 전원이 들어왔으면 제한시간을 기다리지 않고 바로 닫는다
    if (state.finishes.size >= state.activePool.length) finishRace(io, code);
    else broadcastNow(io, code);
  });

  // 결과 보기 — 여기서 순위가 확정되고 점수가 들어간다
  socket.on('maze:reveal', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'finished' && state.status !== 'racing') {
      return reply({ ok: false, error: 'NOT_FINISHED' });
    }

    clearTimers(code);
    state.ranking = rankFinishers(state.finishes);

    const event = getEventByCode(code);
    if (event) {
      state.ranking.forEach((r) => addScore(r.participantId, r.points));
      broadcastScoreboard(io, code, event.id);
    }

    state.status = 'result';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('maze:end', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'result') return reply({ ok: false, error: 'NOT_RESULT' });

    const event = getEventByCode(code);
    if (event) {
      createGameRecord({
        eventId: event.id,
        gameType: 'maze',
        result: {
          control: state.control,
          limitSec: state.limitMs / 1000,
          mazeIndex: state.mazeIndex,
          entrants: state.activePool.length,
          ranking: state.ranking.map((r) => ({ ...toParticipantRef(r.participantId), ...r })),
        },
      });
    }

    state.status = 'ended';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('maze:reset', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    clearTimers(code);
    games.set(code, createInitialState());
    reply({ ok: true });
    broadcastNow(io, code);
  });
}
