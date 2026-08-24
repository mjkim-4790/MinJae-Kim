import { createGameRecord } from '../db/gameRecords.js';
import { getEventByCode } from '../db/events.js';
import { addScore, getParticipantById, listParticipantsByEvent } from '../db/participants.js';
import {
  difficultyById,
  generateSwaps,
  judgeRound,
  PLACE_MS,
  resolveRound,
  totalAnimationMs,
  trackBall,
} from '../game/yabawiEngine.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode } from './rooms.js';
import { broadcastScoreboard } from './scoreboard.js';

// '야바위 게임' 실시간 상태 (rps.js/values.js 와 같은 구조).
//
// 애니메이션 설계가 이 게임의 핵심이다. 스왑을 한 번에 하나씩 실시간으로 쏘면 네트워크
// 지터가 그대로 끊김으로 보이므로, 시작할 때 섞기 순서 전체(plan)를 한 번에 내려보내고
// 각 기기가 로컬에서 재생한다. 서버는 총 재생 시간을 알고 있으니 그만큼 타이머를 걸어
// 스스로 '고르기' 단계로 넘어간다 — 클라이언트가 "다 봤다"고 보고할 필요가 없다.
//
// 정답 자리(answerSlot)는 결과 공개 전까지 브로드캐스트에 넣지 않는다. plan 으로 계산은
// 가능하지만(어차피 화면에 다 보이는 정보다) 굳이 그대로 얹어주지는 않는다.

const MIN_PARTICIPANTS = 1;

const games = new Map(); // eventCode -> YabawiGameState
const pendingTimers = new Map(); // eventCode -> timeout handle

function createInitialState() {
  return {
    status: 'idle', // idle | shuffling | picking | result | ended
    difficulty: null,
    round: 0,
    activePool: [],
    eliminatedIds: [],
    plan: null, // { cups, initialBallIndex, swaps, swapDurationMs, placeMs }
    answerSlot: null,
    picks: new Map(), // participantId -> 고른 자리
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

function clearTimer(code) {
  const timer = pendingTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(code);
  }
}

function toParticipantRef(id) {
  const p = getParticipantById(id);
  return p ? { id: p.id, nickname: p.nickname } : { id, nickname: '알 수 없음' };
}

function publicState(state) {
  const revealed = state.status === 'result' || state.status === 'ended';

  return {
    status: state.status,
    difficulty: state.difficulty
      ? { id: state.difficulty.id, name: state.difficulty.name, points: state.difficulty.points }
      : null,
    round: state.round,
    activeParticipantIds: state.activePool,
    pickedParticipantIds: [...state.picks.keys()], // 누가 골랐는지만 — 무엇을 골랐는지는 공개 전까지 감춘다
    plan: state.plan,
    answerSlot: revealed ? state.answerSlot : null,
    result: revealed && state.lastResult
      ? {
          outcome: state.lastResult.outcome,
          survivors: state.lastResult.survivorIds.map(toParticipantRef),
          eliminated: state.lastResult.eliminatedIds.map(toParticipantRef),
          picks: Object.fromEntries(state.lastResult.picks),
        }
      : null,
  };
}

function broadcastNow(io, code) {
  io.to(eventRoom(code)).emit('yabawi:state', publicState(getState(code)));
}

export function getYabawiSnapshot(eventCode) {
  return publicState(getState(eventCode));
}

/** 재접속 시 이 참여자가 이번 판에 무엇을 골랐는지 되살린다 (rps.js 의 getYourChoice 와 같은 역할). */
export function getYourYabawiPick(eventCode, participantId) {
  const state = getState(eventCode);
  return state.picks.has(participantId) ? state.picks.get(participantId) : null;
}

export function registerYabawiHandlers(io, socket) {
  socket.on('yabawi:start', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status === 'shuffling' || state.status === 'picking') {
      return reply({ ok: false, error: 'ROUND_IN_PROGRESS' });
    }

    const event = getEventByCode(code);
    if (!event) return reply({ ok: false, error: 'EVENT_NOT_FOUND' });

    const difficulty = difficultyById(String(payload.difficultyId ?? ''));
    if (!difficulty) return reply({ ok: false, error: 'INVALID_DIFFICULTY' });

    // 2판째부터는 살아남은 사람들끼리 이어서 한다. 첫 판이면 현재 활성 참여자 전원.
    let pool = state.round > 0 && state.activePool.length > 0 ? state.activePool : null;
    if (!pool) {
      const active = listParticipantsByEvent(event.id).filter((p) => p.status === 'active');
      if (active.length < MIN_PARTICIPANTS) return reply({ ok: false, error: 'NOT_ENOUGH_PARTICIPANTS' });
      pool = active.map((p) => p.id);
      state.eliminatedIds = [];
    }

    const initialBallIndex = Math.floor(Math.random() * difficulty.cups);
    const swaps = generateSwaps(difficulty.cups, difficulty.swaps);

    state.status = 'shuffling';
    state.difficulty = difficulty;
    state.round += 1;
    state.activePool = pool;
    state.plan = {
      cups: difficulty.cups,
      initialBallIndex,
      swaps,
      swapDurationMs: difficulty.swapDurationMs,
      placeMs: PLACE_MS,
    };
    state.answerSlot = trackBall(initialBallIndex, swaps);
    state.picks = new Map();
    state.lastResult = null;

    reply({ ok: true });
    broadcastNow(io, code);

    // 각 기기가 plan 을 다 재생하고 나면 고르기 단계로 — 클라이언트 보고를 기다리지 않고
    // 서버가 같은 길이의 타이머로 스스로 넘어간다.
    clearTimer(code);
    const timer = setTimeout(() => {
      pendingTimers.delete(code);
      const current = getState(code);
      if (current.status !== 'shuffling') return; // 그 사이 리셋됐으면 무시
      current.status = 'picking';
      broadcastNow(io, code);
    }, totalAnimationMs(difficulty));
    pendingTimers.set(code, timer);
  });

  socket.on('yabawi:pick', (payload = {}, ack) => {
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
    if (state.status !== 'picking') return reply({ ok: false, error: 'NOT_PICKING' });

    const participantId = socket.data.participantId;
    if (!state.activePool.includes(participantId)) return reply({ ok: false, error: 'NOT_IN_ROUND' });

    const slot = Number(payload.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= state.plan.cups) {
      return reply({ ok: false, error: 'INVALID_SLOT' });
    }

    state.picks.set(participantId, slot);
    reply({ ok: true, slot });
    broadcastNow(io, code);
  });

  // 운영자가 정답을 공개한다 (전원이 고르지 않아도 언제든 가능 — rps:lock 과 같은 유연함).
  socket.on('yabawi:reveal', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'picking') return reply({ ok: false, error: 'NOT_PICKING' });

    const { survivorIds, eliminatedIds } = judgeRound(state.activePool, state.picks, state.answerSlot);
    const resolved = resolveRound({ activePool: state.activePool, survivorIds, eliminatedIds });

    state.lastResult = {
      outcome: resolved.outcome,
      survivorIds,
      eliminatedIds: resolved.eliminatedIds,
      nextActivePool: resolved.nextActivePool,
      picks: [...state.picks.entries()],
    };
    state.status = 'result';

    reply({ ok: true });
    broadcastNow(io, code);
  });

  // 결과 확정 — 생존자에게 난이도별 점수를 주고 다음 판 인원을 좁힌다.
  socket.on('yabawi:advance', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'result' || !state.lastResult) return reply({ ok: false, error: 'NOT_RESULT' });

    const { outcome, survivorIds, eliminatedIds, nextActivePool } = state.lastResult;
    const event = getEventByCode(code);

    if (event && outcome !== 'wipeout') {
      // 맞힌 사람에게 난이도별 점수 (하 50 / 중 100 / 상 150 — 사용자 결정)
      survivorIds.forEach((id) => addScore(id, state.difficulty.points));
      broadcastScoreboard(io, code, event.id);
    }

    state.activePool = nextActivePool;
    state.eliminatedIds = [...state.eliminatedIds, ...eliminatedIds];

    if (outcome === 'wipeout') {
      // 아무도 못 맞힘 — 무효로 하고 같은 인원으로 다시 (판 수도 되돌린다)
      state.round -= 1;
      state.status = 'idle';
    } else if (outcome === 'ended') {
      if (event) {
        createGameRecord({
          eventId: event.id,
          gameType: 'yabawi',
          result: {
            rounds: state.round,
            difficulty: { id: state.difficulty.id, name: state.difficulty.name },
            pointsPerWin: state.difficulty.points,
            winners: survivorIds.map(toParticipantRef),
            eliminated: state.eliminatedIds.map(toParticipantRef),
          },
        });
      }
      state.status = 'ended';
    } else {
      state.status = 'idle';
    }

    state.plan = null;
    state.answerSlot = null;
    state.picks = new Map();

    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('yabawi:reset', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    clearTimer(code);
    games.set(code, createInitialState());
    reply({ ok: true });
    broadcastNow(io, code);
  });
}
