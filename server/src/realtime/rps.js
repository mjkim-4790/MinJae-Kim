import { createGameRecord } from '../db/gameRecords.js';
import { getEventByCode } from '../db/events.js';
import { addScore, getParticipantById, listParticipantsByEvent } from '../db/participants.js';
import { CHOICES, judgeRound, resolveBranch } from '../game/rpsEngine.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode } from './rooms.js';
import { broadcastScoreboard } from './scoreboard.js';

// 가위바위보 서바이벌 토너먼트 실시간 상태 (설계문서 §6). 이벤트별 서버 메모리에 둔다 (§4.2).
// 최종 결과만 game_records 에 영구 저장한다.

// 최종 승자에게만 동일 점수 부여, 중도 탈락자는 0점 (§9 결정)
const WIN_POINTS = 100;

const games = new Map(); // eventCode -> RpsGameState
const THROTTLE_MS = 200; // §7-3 동시 입력 폭주 대비
const pendingBroadcast = new Map(); // eventCode -> timeout handle

function createInitialState() {
  return {
    status: 'idle', // idle | selecting | locked | result | ended
    round: 0,
    targetWinners: null,
    activePool: [],
    confirmedWinnerIds: [],
    choices: new Map(), // participantId -> choice (이번 라운드)
    lastResult: null, // { operatorChoice, winnerIds, nonWinnerIds, choices, branch }
    finalWinnerIds: null,
    timerEndsAt: null, // 모래시계 연출용, 마감을 자동으로 트리거하지 않음 (§9 결정)
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

function toParticipantRef(id) {
  const p = getParticipantById(id);
  return p ? { id: p.id, nickname: p.nickname } : { id, nickname: '알 수 없음' };
}

function publicState(state) {
  const base = {
    status: state.status,
    round: state.round,
    targetWinners: state.targetWinners,
    activeParticipantIds: state.activePool,
    chosenParticipantIds: [...state.choices.keys()],
    confirmedWinnerIds: state.confirmedWinnerIds,
    timerEndsAt: state.timerEndsAt,
    roundResult: null,
    operatorChoice: null,
    finalWinners: null,
  };

  if ((state.status === 'result' || state.status === 'ended') && state.lastResult) {
    base.operatorChoice = state.lastResult.operatorChoice;
    base.roundResult = {
      winners: state.lastResult.winnerIds.map(toParticipantRef),
      nonWinners: state.lastResult.nonWinnerIds.map(toParticipantRef),
      choices: Object.fromEntries(state.lastResult.choices.entries()),
      // 참여자 화면에 "패자부활전으로" 인지 "최종 탈락" 인지 미리 알려주기 위함
      branchOutcome: state.lastResult.branch.outcome,
    };
  }

  if (state.status === 'ended') {
    base.finalWinners = (state.finalWinnerIds ?? []).map(toParticipantRef);
  }

  return base;
}

function broadcastNow(io, code) {
  io.to(eventRoom(code)).emit('game:state', publicState(getState(code)));
}

// 참여자 선택 카운트처럼 잦은 갱신은 묶어서 내보낸다.
function broadcastThrottled(io, code) {
  if (pendingBroadcast.has(code)) return;
  const timer = setTimeout(() => {
    pendingBroadcast.delete(code);
    broadcastNow(io, code);
  }, THROTTLE_MS);
  pendingBroadcast.set(code, timer);
}

export function getRpsSnapshot(eventCode) {
  return publicState(getState(eventCode));
}

export function getYourChoice(eventCode, participantId) {
  return getState(eventCode).choices.get(participantId) ?? null;
}

export function registerRpsHandlers(io, socket) {
  socket.on('rps:start', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'idle' && state.status !== 'ended') {
      return reply({ ok: false, error: 'GAME_IN_PROGRESS' });
    }

    const event = getEventByCode(code);
    if (!event) return reply({ ok: false, error: 'EVENT_NOT_FOUND' });

    const activeParticipants = listParticipantsByEvent(event.id).filter((p) => p.status === 'active');
    const target = Number(payload.targetWinners);

    if (!Number.isInteger(target) || target < 1 || target > activeParticipants.length) {
      return reply({ ok: false, error: 'INVALID_TARGET' });
    }

    Object.assign(state, createInitialState());
    state.status = 'selecting';
    state.round = 1;
    state.targetWinners = target;
    state.activePool = activeParticipants.map((p) => p.id);

    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('rps:choose', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    const choice = payload.choice;

    if (
      socket.data.role !== 'player' ||
      !socket.data.participantId ||
      socket.data.eventCode !== code
    ) {
      return reply({ ok: false, error: 'FORBIDDEN' });
    }
    if (!CHOICES.includes(choice)) return reply({ ok: false, error: 'INVALID_CHOICE' });

    const state = getState(code);
    if (state.status !== 'selecting') return reply({ ok: false, error: 'NOT_SELECTING' });
    if (!state.activePool.includes(socket.data.participantId)) {
      return reply({ ok: false, error: 'NOT_IN_ROUND' });
    }

    state.choices.set(socket.data.participantId, choice);
    reply({ ok: true });
    broadcastThrottled(io, code);
  });

  socket.on('rps:timer', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'selecting') return reply({ ok: false, error: 'NOT_SELECTING' });

    const seconds = Math.min(120, Math.max(5, Number(payload.seconds) || 15));
    state.timerEndsAt = Date.now() + seconds * 1000;
    reply({ ok: true, timerEndsAt: state.timerEndsAt });
    broadcastNow(io, code);
  });

  socket.on('rps:lock', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'selecting') return reply({ ok: false, error: 'NOT_SELECTING' });

    state.status = 'locked';
    state.timerEndsAt = null;
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('rps:confirm', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'locked') return reply({ ok: false, error: 'NOT_LOCKED' });
    if (!CHOICES.includes(payload.choice)) return reply({ ok: false, error: 'INVALID_CHOICE' });

    const { winnerIds, nonWinnerIds } = judgeRound(state.activePool, state.choices, payload.choice);
    const branch = resolveBranch({
      confirmedWinnerIds: state.confirmedWinnerIds,
      winnerIds,
      nonWinnerIds,
      activePool: state.activePool,
      target: state.targetWinners,
    });

    state.lastResult = {
      operatorChoice: payload.choice,
      winnerIds,
      nonWinnerIds,
      choices: new Map(state.choices),
      branch,
    };
    state.status = 'result';

    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('rps:advance', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'result' || !state.lastResult) {
      return reply({ ok: false, error: 'NOT_RESULT' });
    }

    const { branch } = state.lastResult;

    if (branch.outcome === 'ended') {
      state.status = 'ended';
      state.finalWinnerIds = branch.finalWinnerIds;
      state.confirmedWinnerIds = branch.finalWinnerIds;
      state.activePool = [];

      const event = getEventByCode(code);
      if (event) {
        branch.finalWinnerIds.forEach((id) => addScore(id, WIN_POINTS));
        createGameRecord({
          eventId: event.id,
          gameType: 'rps',
          result: {
            targetWinners: state.targetWinners,
            rounds: state.round,
            pointsAwarded: WIN_POINTS,
            finalWinners: branch.finalWinnerIds.map(toParticipantRef),
          },
        });
        broadcastScoreboard(io, code, event.id);
      }
    } else {
      state.activePool = branch.nextActivePool;
      state.confirmedWinnerIds = branch.nextConfirmedWinnerIds;
      state.choices = new Map();
      state.lastResult = null;
      state.status = 'selecting';
      if (branch.outcome !== 'wipeout') state.round += 1;
    }

    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('rps:restartRound', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'locked' && state.status !== 'result') {
      return reply({ ok: false, error: 'INVALID_STATUS' });
    }

    state.choices = new Map();
    state.lastResult = null;
    state.timerEndsAt = null;
    state.status = 'selecting';

    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('rps:reset', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    games.set(code, createInitialState());
    reply({ ok: true });
    broadcastNow(io, code);
  });
}
