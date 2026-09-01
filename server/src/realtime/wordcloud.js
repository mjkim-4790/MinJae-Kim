import { createGameRecord } from '../db/gameRecords.js';
import { getEventByCode } from '../db/events.js';
import {
  clampBurst,
  isValidPreset,
  modeById,
  normalizePresetWords,
  normalizePrompt,
  normalizeWord,
  tally,
  topWords,
  MAX_DISTINCT_WORDS,
} from '../game/wordcloudEngine.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode } from './rooms.js';

// 단어 구름 실시간 상태 (acrostic.js/yabawi.js 와 같은 구조 — 이벤트별 서버 메모리에
// 두고, 최종 결과만 game_records 에 남긴다).
//
// 두 가지가 이 게임의 성격을 정한다 (운영 결정):
//  1) 실시간으로 자란다. 제출이 들어오는 즉시 구름이 커지고, 진행자는 '마감'으로
//     더 못 내게만 막는다. 그래서 정답/승패 판정이 없다.
//  2) 익명이다. 누가 어떤 단어를 냈는지는 publicState() 에 절대 넣지 않는다
//     (삼행시와 같은 이유 — 눈치 보지 않고 솔직하게 내게 하려는 것).
//     각자 "내가 낸 단어"는 재접속 때 그 사람 소켓에만 따로 돌려준다.
//
// 무제한 연타를 허용하므로 브로드캐스트는 200ms 로 묶는다 (acrostic.js 와 동일한 이유).
// 클라이언트도 연타를 모아서 보내지만, 서버는 그걸 믿지 않고 clampBurst 로 자른다.

const games = new Map(); // eventCode -> WordcloudGameState
const THROTTLE_MS = 200;
const pendingBroadcast = new Map(); // eventCode -> timeout handle

function createInitialState() {
  return {
    status: 'idle', // idle | collecting | closed | ended
    mode: null, // 'buttons' | 'text'
    prompt: '',
    presetWords: [], // buttons 모드에서 진행자가 미리 정한 단어
    counts: new Map(), // word -> 총 횟수
    contributors: new Set(), // 한 번이라도 낸 참여자 (인원수만 공개한다)
    perParticipant: new Map(), // participantId -> Map(word -> 횟수) — 재접속 복원용, 공개 금지
    totalCount: 0,
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

function publicState(state) {
  return {
    status: state.status,
    mode: state.mode,
    prompt: state.prompt,
    presetWords: state.presetWords,
    words: tally(state.counts), // [{ word, count }] — 누가 냈는지는 없다
    contributorCount: state.contributors.size,
    totalCount: state.totalCount,
    top: state.status === 'closed' || state.status === 'ended' ? topWords(state.counts) : [],
  };
}

function broadcastNow(io, code) {
  const timer = pendingBroadcast.get(code);
  if (timer) {
    clearTimeout(timer);
    pendingBroadcast.delete(code);
  }
  io.to(eventRoom(code)).emit('wordcloud:state', publicState(getState(code)));
}

/** 제출 폭주 때도 화면이 버티도록 200ms 안의 변경을 한 번으로 묶는다. */
function broadcastThrottled(io, code) {
  if (pendingBroadcast.has(code)) return;
  const timer = setTimeout(() => {
    pendingBroadcast.delete(code);
    io.to(eventRoom(code)).emit('wordcloud:state', publicState(getState(code)));
  }, THROTTLE_MS);
  pendingBroadcast.set(code, timer);
}

export function getWordcloudSnapshot(eventCode) {
  return publicState(getState(eventCode));
}

/** 재접속 시 이 참여자가 낸 단어를 되살린다 (본인에게만 보낸다). */
export function getYourWordcloudWords(eventCode, participantId) {
  const state = getState(eventCode);
  const mine = state.perParticipant.get(participantId);
  return mine ? [...mine.entries()].map(([word, count]) => ({ word, count })) : [];
}

export function registerWordcloudHandlers(io, socket) {
  socket.on('wordcloud:start', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const mode = modeById(String(payload.mode ?? ''));
    if (!mode) return reply({ ok: false, error: 'INVALID_MODE' });

    const presetWords = mode.id === 'buttons' ? normalizePresetWords(payload.words) : [];
    if (mode.id === 'buttons' && !isValidPreset(presetWords)) {
      return reply({ ok: false, error: 'NEED_MORE_WORDS' });
    }

    const state = getState(code);
    state.status = 'collecting';
    state.mode = mode.id;
    state.prompt = normalizePrompt(payload.prompt);
    state.presetWords = presetWords;
    state.counts = new Map();
    state.contributors = new Set();
    state.perParticipant = new Map();
    state.totalCount = 0;

    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('wordcloud:submit', (payload = {}, ack) => {
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
    if (state.status !== 'collecting') return reply({ ok: false, error: 'NOT_COLLECTING' });

    const word = normalizeWord(payload.word);
    if (!word) return reply({ ok: false, error: 'INVALID_WORD' });

    // 버튼 모드에서는 진행자가 정한 단어만 받는다 (클라이언트를 믿지 않는다)
    if (state.mode === 'buttons' && !state.presetWords.includes(word)) {
      return reply({ ok: false, error: 'NOT_ALLOWED_WORD' });
    }

    // 새 단어가 화면을 넘칠 만큼 쌓이면 더 늘리지 않는다 (이미 있는 단어는 계속 받는다)
    const isNew = !state.counts.has(word);
    if (isNew && state.counts.size >= MAX_DISTINCT_WORDS) {
      return reply({ ok: false, error: 'TOO_MANY_WORDS' });
    }

    const burst = clampBurst(payload.count ?? 1);
    if (burst === 0) return reply({ ok: false, error: 'INVALID_COUNT' });

    state.counts.set(word, (state.counts.get(word) ?? 0) + burst);
    state.totalCount += burst;
    state.contributors.add(socket.data.participantId);

    let mine = state.perParticipant.get(socket.data.participantId);
    if (!mine) {
      mine = new Map();
      state.perParticipant.set(socket.data.participantId, mine);
    }
    mine.set(word, (mine.get(word) ?? 0) + burst);

    reply({ ok: true, word, count: mine.get(word) });
    broadcastThrottled(io, code);
  });

  // 마감 — 더 이상 못 내게 막는다. 구름은 그대로 남아 있다.
  socket.on('wordcloud:close', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'collecting') return reply({ ok: false, error: 'NOT_COLLECTING' });

    state.status = 'closed';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  // 마감했다가 다시 열기 (진행자가 실수로 눌렀거나 더 받고 싶을 때)
  socket.on('wordcloud:reopen', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'closed') return reply({ ok: false, error: 'NOT_CLOSED' });

    state.status = 'collecting';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('wordcloud:end', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'collecting' && state.status !== 'closed') {
      return reply({ ok: false, error: 'NOT_RUNNING' });
    }

    const event = getEventByCode(code);
    if (event) {
      createGameRecord({
        eventId: event.id,
        gameType: 'wordcloud',
        result: {
          mode: state.mode,
          prompt: state.prompt,
          words: tally(state.counts),
          top: topWords(state.counts),
          contributorCount: state.contributors.size,
          totalCount: state.totalCount,
        },
      });
    }

    state.status = 'ended';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('wordcloud:reset', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const timer = pendingBroadcast.get(code);
    if (timer) {
      clearTimeout(timer);
      pendingBroadcast.delete(code);
    }
    games.set(code, createInitialState());
    reply({ ok: true });
    broadcastNow(io, code);
  });
}
