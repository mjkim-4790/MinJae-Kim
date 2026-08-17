import { createGameRecord } from '../db/gameRecords.js';
import { getEventByCode } from '../db/events.js';
import { addScore, getParticipantById, listParticipantsByEvent } from '../db/participants.js';
import { categoryById } from '../game/liarWords.js';
import { pickLiar, pickWordPair, resolveWinner, shuffleOrder, tallyVotes } from '../game/liarEngine.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode, roleRoom } from './rooms.js';
import { broadcastScoreboard } from './scoreboard.js';

// 라이어 게임 실시간 상태 (운영자 요청 기반 신규 기능. rps.js 와 같은 구조 — 이벤트별
// 서버 메모리에 두고, 최종 결과만 game_records 에 영구 저장한다).
//
// 핵심: 참여자별로 받은 단어(words)와 누가 라이어인지(liarParticipantId)는 "결과 공개
// (result) 전까지 절대 전체 브로드캐스트에 넣지 않는다" — publicState() 를 보면 알 수
// 있듯 이 두 값은 status 가 result/ended 가 되기 전까지 응답에 등장하지 않는다. 각자의
// 단어는 liar:start 시점에 해당 참여자의 소켓에만 개별로 쏴준다(pushWordsToPlayers).

export const MANUAL_CATEGORY_ID = 'manual';
const WIN_POINTS = 100; // 가위바위보와 동일 (§9 결정과 동일한 관례를 따름)
const MIN_PARTICIPANTS = 3; // 라이어 1 + 시민 2 이상은 있어야 지목 투표가 의미 있다

const games = new Map(); // eventCode -> LiarGameState
const THROTTLE_MS = 200; // 투표 집계 같은 잦은 갱신은 묶어서 내보낸다 (rps.js 와 동일한 이유)
const pendingBroadcast = new Map(); // eventCode -> timeout handle

function createInitialState() {
  return {
    status: 'idle', // idle | describing | voting | result | ended
    category: null, // { id, name }
    activePool: [],
    liarParticipantId: null,
    words: new Map(), // participantId -> word (비공개 — publicState 에 절대 넣지 않는다)
    turnOrder: [],
    currentTurnIndex: 0,
    votes: new Map(), // voterId -> accusedId
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

function toParticipantRef(id) {
  if (id == null) return null;
  const p = getParticipantById(id);
  return p ? { id: p.id, nickname: p.nickname } : { id, nickname: '알 수 없음' };
}

function publicState(state) {
  const base = {
    status: state.status,
    category: state.category,
    activeParticipantIds: state.activePool,
    turnOrder: state.turnOrder,
    currentTurnParticipantId: state.turnOrder[state.currentTurnIndex] ?? null,
    votedParticipantIds: [...state.votes.keys()],
    result: null,
  };

  if ((state.status === 'result' || state.status === 'ended') && state.lastResult) {
    base.result = {
      winner: state.lastResult.winner,
      tie: state.lastResult.tie,
      counts: state.lastResult.counts,
      accused: toParticipantRef(state.lastResult.accusedId),
      liar: toParticipantRef(state.liarParticipantId),
      liarWord: state.lastResult.liarWord,
      citizenWord: state.lastResult.citizenWord,
    };
  }

  return base;
}

function broadcastNow(io, code) {
  io.to(eventRoom(code)).emit('liar:state', publicState(getState(code)));
}

function broadcastThrottled(io, code) {
  if (pendingBroadcast.has(code)) return;
  const timer = setTimeout(() => {
    pendingBroadcast.delete(code);
    broadcastNow(io, code);
  }, THROTTLE_MS);
  pendingBroadcast.set(code, timer);
}

// 각 참여자에게 "내 단어"를 개별로 쏴준다. 절대 방 전체로 브로드캐스트하지 않는다.
async function pushWordsToPlayers(io, code, state) {
  const sockets = await io.in(roleRoom(code, 'player')).fetchSockets();
  for (const s of sockets) {
    const participantId = s.data.participantId;
    if (!participantId || !state.words.has(participantId)) continue;
    s.emit('liar:yourWord', {
      word: state.words.get(participantId),
      isLiar: state.liarParticipantId === participantId,
    });
  }
}

export function getLiarSnapshot(eventCode) {
  return publicState(getState(eventCode));
}

/** 재접속 시 이 참여자의 단어를 다시 알려주기 위함 (rps.js 의 getYourChoice 와 같은 역할). */
export function getYourLiarWord(eventCode, participantId) {
  const state = getState(eventCode);
  if (!state.words.has(participantId)) return null;
  return { word: state.words.get(participantId), isLiar: state.liarParticipantId === participantId };
}

export function registerLiarHandlers(io, socket) {
  socket.on('liar:start', async (payload = {}, ack) => {
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
    if (activeParticipants.length < MIN_PARTICIPANTS) {
      return reply({ ok: false, error: 'NOT_ENOUGH_PARTICIPANTS' });
    }

    const categoryId = String(payload.categoryId ?? '');
    let categoryName;
    let citizenWord;
    let liarWord;

    if (categoryId === MANUAL_CATEGORY_ID) {
      citizenWord = String(payload.citizenWord ?? '').trim().slice(0, 40);
      liarWord = String(payload.liarWord ?? '').trim().slice(0, 40);
      if (!citizenWord || !liarWord) return reply({ ok: false, error: 'INVALID_WORDS' });
      categoryName = '수동';
    } else {
      const category = categoryById(categoryId);
      if (!category) return reply({ ok: false, error: 'INVALID_CATEGORY' });
      if (category.words.length < 2) return reply({ ok: false, error: 'CATEGORY_NOT_READY' });
      ({ citizenWord, liarWord } = pickWordPair(category.words));
      categoryName = category.name;
    }

    Object.assign(state, createInitialState());
    state.status = 'describing';
    state.category = { id: categoryId, name: categoryName };
    state.activePool = activeParticipants.map((p) => p.id);
    state.liarParticipantId = pickLiar(state.activePool);
    state.turnOrder = shuffleOrder(state.activePool);
    for (const id of state.activePool) {
      state.words.set(id, id === state.liarParticipantId ? liarWord : citizenWord);
    }

    reply({ ok: true });
    broadcastNow(io, code);
    await pushWordsToPlayers(io, code, state);
  });

  socket.on('liar:next', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (socket.data.role !== 'player' || !socket.data.participantId || socket.data.eventCode !== code) {
      return reply({ ok: false, error: 'FORBIDDEN' });
    }

    const state = getState(code);
    if (state.status !== 'describing') return reply({ ok: false, error: 'NOT_DESCRIBING' });
    if (!state.activePool.includes(socket.data.participantId)) {
      return reply({ ok: false, error: 'NOT_IN_ROUND' });
    }

    state.currentTurnIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
    reply({ ok: true });
    broadcastNow(io, code);
  });

  // 의심스러운 사람이 있으면 누구든 눌러서 바로 투표 단계로 넘긴다 (운영 결정: 1명이라도 누르면 즉시 진행).
  socket.on('liar:stop', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (socket.data.role !== 'player' || !socket.data.participantId || socket.data.eventCode !== code) {
      return reply({ ok: false, error: 'FORBIDDEN' });
    }

    const state = getState(code);
    if (state.status !== 'describing') return reply({ ok: false, error: 'NOT_DESCRIBING' });
    if (!state.activePool.includes(socket.data.participantId)) {
      return reply({ ok: false, error: 'NOT_IN_ROUND' });
    }

    state.status = 'voting';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('liar:vote', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (socket.data.role !== 'player' || !socket.data.participantId || socket.data.eventCode !== code) {
      return reply({ ok: false, error: 'FORBIDDEN' });
    }

    const state = getState(code);
    if (state.status !== 'voting') return reply({ ok: false, error: 'NOT_VOTING' });

    const voterId = socket.data.participantId;
    if (!state.activePool.includes(voterId)) return reply({ ok: false, error: 'NOT_IN_ROUND' });

    const accusedId = Number(payload.accusedId);
    if (!state.activePool.includes(accusedId)) return reply({ ok: false, error: 'INVALID_TARGET' });
    if (accusedId === voterId) return reply({ ok: false, error: 'CANNOT_VOTE_SELF' });

    state.votes.set(voterId, accusedId);
    reply({ ok: true });
    broadcastThrottled(io, code);
  });

  // 운영자가 투표를 마감하고 결과를 공개한다 (전원이 투표하지 않아도 언제든 마감 가능 — rps:lock 과 동일한 유연함).
  socket.on('liar:lock', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'voting') return reply({ ok: false, error: 'NOT_VOTING' });

    const { accusedId, tie, counts } = tallyVotes(state.votes);
    const winner = resolveWinner(accusedId, state.liarParticipantId);
    const citizenId = state.activePool.find((id) => id !== state.liarParticipantId);

    state.lastResult = {
      accusedId,
      tie,
      counts,
      winner,
      liarWord: state.words.get(state.liarParticipantId),
      citizenWord: state.words.get(citizenId),
    };
    state.status = 'result';

    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('liar:advance', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'result' || !state.lastResult) return reply({ ok: false, error: 'NOT_RESULT' });

    const event = getEventByCode(code);
    if (event) {
      const winnerIds =
        state.lastResult.winner === 'liar'
          ? [state.liarParticipantId]
          : state.activePool.filter((id) => id !== state.liarParticipantId);

      winnerIds.forEach((id) => addScore(id, WIN_POINTS));
      createGameRecord({
        eventId: event.id,
        gameType: 'liar',
        result: {
          category: state.category,
          liar: toParticipantRef(state.liarParticipantId),
          accused: toParticipantRef(state.lastResult.accusedId),
          winner: state.lastResult.winner,
          pointsAwarded: WIN_POINTS,
          winners: winnerIds.map(toParticipantRef),
        },
      });
      broadcastScoreboard(io, code, event.id);
    }

    state.status = 'ended';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('liar:reset', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    games.set(code, createInitialState());
    reply({ ok: true });
    broadcastNow(io, code);
  });
}
