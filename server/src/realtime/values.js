import { getEventByCode } from '../db/events.js';
import { getParticipantById, listParticipantsByEvent } from '../db/participants.js';
import { crossWord, isValidWordList, normalizeWords } from '../game/valuesEngine.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode } from './rooms.js';

// '나의 가치여정' 실시간 상태 (rps.js/liar.js/typing.js/acrostic.js 와 같은 구조 —
// 이벤트별 서버 메모리에 둔다). 다른 게임과 달리 공유 제시어도 투표도 없이 참여자마다
// 완전히 개별적인 활동이라, 각자의 단어 목록·취소선 상태는 절대 방 전체에 브로드캐스트
// 하지 않고 "그 사람 소켓의 ack 응답"으로만 돌려준다 — publicState() 에는 누가 최종
// 단어까지 도달했는지(완료자 명단, finishers)만 담겨 대형 스크린/운영자 화면에 쓰인다.
//
// 점수는 반영하지 않는다 (개인 성찰용 게임 — 사용자 결정).

const MIN_PARTICIPANTS = 1;

const games = new Map(); // eventCode -> ValuesGameState

function createInitialState() {
  return {
    status: 'idle', // idle | writing | ended
    activePool: [],
    entries: new Map(), // participantId -> { words, crossedIndices: Set<number>, done, finalWord }
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
  const finishers = [...state.entries.entries()]
    .filter(([, e]) => e.done)
    .map(([participantId, e]) => ({ ...toParticipantRef(participantId), word: e.finalWord }));

  return {
    status: state.status,
    activeParticipantIds: state.activePool,
    submittedParticipantIds: [...state.entries.keys()],
    finishers,
  };
}

function yourState(state, participantId) {
  const entry = state.entries.get(participantId);
  if (!entry) return null;
  return {
    words: entry.words,
    crossedIndices: [...entry.crossedIndices],
    done: entry.done,
    finalWord: entry.finalWord,
  };
}

function broadcastNow(io, code) {
  io.to(eventRoom(code)).emit('values:state', publicState(getState(code)));
}

export function getValuesSnapshot(eventCode) {
  return publicState(getState(eventCode));
}

/** 재접속 시 이 참여자의 단어 목록·취소선 상태를 다시 알려주기 위함
 * (getYourLiarWord/getYourAcrosticEntry 와 같은 역할). 아직 제출 전이면 null. */
export function getYourValuesState(eventCode, participantId) {
  return yourState(getState(eventCode), participantId);
}

export function registerValuesHandlers(io, socket) {
  socket.on('values:start', (payload = {}, ack) => {
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

    Object.assign(state, createInitialState());
    state.status = 'writing';
    state.activePool = activeParticipants.map((p) => p.id);

    reply({ ok: true });
    broadcastNow(io, code);
  });

  // 참여자가 10~15개 단어를 다 적고 '다음'을 누른다 — 이 순간부터 지우기 단계로 들어간다.
  socket.on('values:submit', (payload = {}, ack) => {
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
    if (state.entries.has(participantId)) return reply({ ok: false, error: 'ALREADY_SUBMITTED' });

    const words = normalizeWords(payload.words);
    if (!isValidWordList(words)) return reply({ ok: false, error: 'INVALID_WORD_COUNT' });

    state.entries.set(participantId, { words, crossedIndices: new Set(), done: false, finalWord: null });
    reply({ ok: true, words, crossedIndices: [], done: false, finalWord: null });
    broadcastNow(io, code); // 운영자 화면의 진행 현황(제출자 수) 갱신용
  });

  // 참여자가 자기 단어 하나에 취소선을 긋는다. 마지막 1개가 남으면 done=true 로
  // 응답하고, 그때만 완료자 명단을 방 전체(스크린)에 알린다.
  socket.on('values:cross', (payload = {}, ack) => {
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

    const entry = state.entries.get(socket.data.participantId);
    if (!entry) return reply({ ok: false, error: 'NOT_SUBMITTED' });
    if (entry.done) return reply({ ok: false, error: 'ALREADY_DONE' });

    const result = crossWord(entry.words, entry.crossedIndices, Number(payload.index));
    if (!result.ok) return reply({ ok: false, error: result.error });

    entry.crossedIndices = result.crossedIndices;
    entry.done = result.done;
    entry.finalWord = result.finalWord;

    reply({ ok: true, crossedIndices: [...entry.crossedIndices], done: entry.done, finalWord: entry.finalWord });
    if (entry.done) broadcastNow(io, code);
  });

  // 운영자가 '마감'을 누르면 진행 상황과 무관하게 그 순간 전원 종료된다 (운영 결정).
  socket.on('values:lock', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'writing') return reply({ ok: false, error: 'NOT_WRITING' });

    state.status = 'ended';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('values:reset', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    games.set(code, createInitialState());
    reply({ ok: true });
    broadcastNow(io, code);
  });
}
