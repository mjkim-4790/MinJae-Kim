import { createGameRecord } from '../db/gameRecords.js';
import { getEventByCode } from '../db/events.js';
import { addScore, getParticipantById, listParticipantsByEvent } from '../db/participants.js';
import {
  isMatch,
  MANUAL_DIFFICULTY_ID,
  normalizeSentence,
  randomSentence,
  rankSubmissions,
} from '../game/typingEngine.js';
import { difficultyById } from '../game/typingSentences.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode } from './rooms.js';
import { broadcastScoreboard } from './scoreboard.js';

// '메시지 빨리 보내기' 실시간 상태 (rps.js/liar.js 와 같은 구조 — 이벤트별 서버 메모리에
// 두고, 최종 결과만 game_records 에 영구 저장한다).
//
// 제시 문장은 라이어의 단어와 달리 아무에게도 비밀이 아니다 — 시작하자마자 스크린과
// 참여자 모두에게 그대로 보여준다. 그래서 liar.js 처럼 개별 소켓에 따로 쏴줄 필요 없이
// publicState() 에 항상 실어 보낸다.

const WIN_POINTS = 100; // 1등에게만 부여 (가위바위보/라이어와 동일한 관례)

const games = new Map(); // eventCode -> TypingGameState
const THROTTLE_MS = 200; // 동시 제출 폭주 대비 (rps.js 와 동일한 이유)
const pendingBroadcast = new Map(); // eventCode -> timeout handle

function createInitialState() {
  return {
    status: 'idle', // idle | writing | locked | result | ended
    difficulty: null, // { id, name }
    sentence: null,
    startedAt: null,
    activePool: [],
    submissions: new Map(), // participantId -> elapsedMs
    ranking: null, // [{ participantId, elapsedMs, rank }] — reveal 시점에 계산
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
    difficulty: state.difficulty,
    sentence: state.status === 'idle' ? null : state.sentence,
    activeParticipantIds: state.activePool,
    submittedParticipantIds: [...state.submissions.keys()],
    startedAt: state.startedAt,
    ranking: null,
    unsubmitted: null, // 참여자 참조({id,nickname}) 배열 — 다른 *ParticipantIds 필드와 달리 id만이 아니다
  };

  if ((state.status === 'result' || state.status === 'ended') && state.ranking) {
    base.ranking = state.ranking.map((r) => ({ ...toParticipantRef(r.participantId), elapsedMs: r.elapsedMs, rank: r.rank }));
    const submittedIds = new Set(state.submissions.keys());
    base.unsubmitted = state.activePool.filter((id) => !submittedIds.has(id)).map(toParticipantRef);
  }

  return base;
}

function broadcastNow(io, code) {
  io.to(eventRoom(code)).emit('typing:state', publicState(getState(code)));
}

function broadcastThrottled(io, code) {
  if (pendingBroadcast.has(code)) return;
  const timer = setTimeout(() => {
    pendingBroadcast.delete(code);
    broadcastNow(io, code);
  }, THROTTLE_MS);
  pendingBroadcast.set(code, timer);
}

export function getTypingSnapshot(eventCode) {
  return publicState(getState(eventCode));
}

export function registerTypingHandlers(io, socket) {
  socket.on('typing:start', (payload = {}, ack) => {
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
    if (activeParticipants.length === 0) return reply({ ok: false, error: 'NOT_ENOUGH_PARTICIPANTS' });

    const difficultyId = String(payload.difficultyId ?? '');
    let difficultyName;
    let sentence;

    if (difficultyId === MANUAL_DIFFICULTY_ID) {
      sentence = normalizeSentence(payload.sentence).slice(0, 200);
      if (!sentence) return reply({ ok: false, error: 'INVALID_SENTENCE' });
      difficultyName = '직접 작성';
    } else {
      const difficulty = difficultyById(difficultyId);
      if (!difficulty) return reply({ ok: false, error: 'INVALID_DIFFICULTY' });
      sentence = randomSentence(difficultyId);
      if (!sentence) return reply({ ok: false, error: 'DIFFICULTY_NOT_READY' });
      difficultyName = difficulty.name;
    }

    Object.assign(state, createInitialState());
    state.status = 'writing';
    state.difficulty = { id: difficultyId, name: difficultyName };
    state.sentence = sentence;
    state.startedAt = Date.now();
    state.activePool = activeParticipants.map((p) => p.id);

    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('typing:submit', (payload = {}, ack) => {
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
    if (state.status !== 'writing') return reply({ ok: false, error: 'NOT_WRITING' });

    const participantId = socket.data.participantId;
    if (!state.activePool.includes(participantId)) return reply({ ok: false, error: 'NOT_IN_ROUND' });
    if (state.submissions.has(participantId)) return reply({ ok: false, error: 'ALREADY_SUBMITTED' });

    if (!isMatch(payload.text, state.sentence)) return reply({ ok: false, error: 'MISMATCH' });

    state.submissions.set(participantId, Date.now() - state.startedAt);
    reply({ ok: true });
    broadcastThrottled(io, code);
  });

  socket.on('typing:lock', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'writing') return reply({ ok: false, error: 'NOT_WRITING' });

    state.status = 'locked';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('typing:reveal', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'locked') return reply({ ok: false, error: 'NOT_LOCKED' });

    state.ranking = rankSubmissions(state.submissions);
    state.status = 'result';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('typing:advance', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'result' || !state.ranking) return reply({ ok: false, error: 'NOT_RESULT' });

    const event = getEventByCode(code);
    if (event) {
      const winner = state.ranking.find((r) => r.rank === 1) ?? null;
      if (winner) addScore(winner.participantId, WIN_POINTS);

      createGameRecord({
        eventId: event.id,
        gameType: 'typing',
        result: {
          difficulty: state.difficulty,
          sentence: state.sentence,
          pointsAwarded: winner ? WIN_POINTS : 0,
          winner: winner ? toParticipantRef(winner.participantId) : null,
          ranking: state.ranking.map((r) => ({ ...toParticipantRef(r.participantId), elapsedMs: r.elapsedMs, rank: r.rank })),
        },
      });
      broadcastScoreboard(io, code, event.id);
    }

    state.status = 'ended';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('typing:reset', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    games.set(code, createInitialState());
    reply({ ok: true });
    broadcastNow(io, code);
  });
}
