import { createGameRecord } from '../db/gameRecords.js';
import { getEventByCode } from '../db/events.js';
import { addScore, getParticipantById, listParticipantsByEvent } from '../db/participants.js';
import {
  isValidPrompt,
  normalizeLines,
  rankEntries,
  shuffle,
  splitPrompt,
  tallyVotes,
} from '../game/acrosticEngine.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode, roleRoom } from './rooms.js';
import { broadcastScoreboard } from './scoreboard.js';

// 삼행시 실시간 상태 (rps.js/liar.js/typing.js 와 같은 구조 — 이벤트별 서버 메모리에
// 두고, 최종 결과만 game_records 에 영구 저장한다).
//
// 핵심: 투표 단계에서는 "누가 쓴 삼행시인지" 를 절대 브로드캐스트에 넣지 않는다
// (운영 결정 — 인기투표가 아니라 내용으로 뽑게 하고, 결과 발표 때 반전을 만든다).
// publicState() 를 보면 알 수 있듯 entry.participantId/nickname 은 status 가
// result/ended 가 되기 전까지 응답에 등장하지 않는다. 각자 "내 작품이 몇 번인지"는
// 마감 시점에 해당 참여자의 소켓에만 개별로 쏴준다(pushEntryIdsToPlayers) — 자기
// 작품에 투표하지 못하게 클라이언트에서 막기 위함이고, 서버도 따로 한 번 더 막는다.

const WIN_POINTS = 100; // 1등에게만 부여 (다른 게임과 동일한 관례)
// 투표가 의미 있으려면 2명 이상이지만, 1명일 때도 시작은 되게 둔다 — 운영자가 혼자
// 리허설해볼 수 있어야 한다 (client/src/lib/acrostic.js 의 MIN_PARTICIPANTS 와 맞출 것).
const MIN_PARTICIPANTS = 1;

const games = new Map(); // eventCode -> AcrosticGameState
const THROTTLE_MS = 200; // 제출/투표 폭주 대비 (rps.js 와 동일한 이유)
const pendingBroadcast = new Map(); // eventCode -> timeout handle

function createInitialState() {
  return {
    status: 'idle', // idle | writing | voting | result | ended
    prompt: null, // 제시어 원문 ("민재야")
    syllables: [], // ['민','재','야']
    activePool: [],
    submissions: new Map(), // participantId -> string[] (줄별 뒷부분)
    entries: [], // 마감 시점에 섞어서 번호를 매긴 작품들 [{ entryId, participantId, lines }]
    votes: new Map(), // voterId -> entryId
    ranking: null, // 결과 공개 시점에 계산
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
  const revealed = state.status === 'result' || state.status === 'ended';

  const base = {
    status: state.status,
    prompt: state.prompt,
    syllables: state.syllables,
    activeParticipantIds: state.activePool,
    submittedParticipantIds: [...state.submissions.keys()],
    votedParticipantIds: [...state.votes.keys()],
    // 투표 단계: 익명 (작성자 정보 없음). 결과 단계에서만 작성자와 득표수가 붙는다.
    entries:
      state.status === 'voting'
        ? state.entries.map((e) => ({ entryId: e.entryId, lines: e.lines }))
        : null,
    ranking: null,
  };

  if (revealed && state.ranking) {
    base.ranking = state.ranking.map((e) => ({
      entryId: e.entryId,
      lines: e.lines,
      votes: e.votes,
      rank: e.rank,
      ...toParticipantRef(e.participantId),
    }));
  }

  return base;
}

function broadcastNow(io, code) {
  io.to(eventRoom(code)).emit('acrostic:state', publicState(getState(code)));
}

function broadcastThrottled(io, code) {
  if (pendingBroadcast.has(code)) return;
  const timer = setTimeout(() => {
    pendingBroadcast.delete(code);
    broadcastNow(io, code);
  }, THROTTLE_MS);
  pendingBroadcast.set(code, timer);
}

// 각 참여자에게 "내 작품 번호"를 개별로 쏴준다. 절대 방 전체로 브로드캐스트하지 않는다
// (liar.js 의 pushWordsToPlayers 와 같은 이유·같은 방식).
async function pushEntryIdsToPlayers(io, code, state) {
  const sockets = await io.in(roleRoom(code, 'player')).fetchSockets();
  for (const s of sockets) {
    const participantId = s.data.participantId;
    if (!participantId) continue;
    const mine = state.entries.find((e) => e.participantId === participantId);
    if (!mine) continue;
    s.emit('acrostic:yourEntry', { entryId: mine.entryId });
  }
}

export function getAcrosticSnapshot(eventCode) {
  return publicState(getState(eventCode));
}

/** 재접속 시 이 참여자의 작품 번호를 다시 알려주기 위함 (getYourLiarWord 와 같은 역할). */
export function getYourAcrosticEntry(eventCode, participantId) {
  const state = getState(eventCode);
  const mine = state.entries.find((e) => e.participantId === participantId);
  return mine ? { entryId: mine.entryId } : null;
}

export function registerAcrosticHandlers(io, socket) {
  // 진행자가 제시어를 직접 적고 '확인'을 누르면 참여자 화면에 제시어가 뜬다.
  socket.on('acrostic:start', (payload = {}, ack) => {
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

    const syllables = splitPrompt(payload.prompt);
    if (!isValidPrompt(syllables)) return reply({ ok: false, error: 'INVALID_PROMPT' });

    Object.assign(state, createInitialState());
    state.status = 'writing';
    state.prompt = syllables.join('');
    state.syllables = syllables;
    state.activePool = activeParticipants.map((p) => p.id);

    reply({ ok: true });
    broadcastNow(io, code);
  });

  // 참여자가 다 적고 '완료'를 누른다. 마감 전이면 다시 눌러 고쳐 낼 수 있다.
  socket.on('acrostic:submit', (payload = {}, ack) => {
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

    const lines = normalizeLines(payload.lines, state.syllables.length);
    if (!lines) return reply({ ok: false, error: 'EMPTY_SUBMISSION' });

    state.submissions.set(participantId, lines);
    reply({ ok: true });
    broadcastThrottled(io, code);
  });

  // 진행자가 '마감'을 누르면 작성이 끝나고 익명 투표가 열린다.
  socket.on('acrostic:lock', async (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'writing') return reply({ ok: false, error: 'NOT_WRITING' });
    if (state.submissions.size === 0) return reply({ ok: false, error: 'NO_SUBMISSIONS' });

    // 제출 순서로 작성자가 유추되지 않도록, 섞은 뒤에 1번부터 번호를 매긴다.
    state.entries = shuffle([...state.submissions.entries()]).map(([participantId, lines], i) => ({
      entryId: i + 1,
      participantId,
      lines,
    }));
    state.status = 'voting';

    reply({ ok: true });
    broadcastNow(io, code);
    await pushEntryIdsToPlayers(io, code, state);
  });

  socket.on('acrostic:vote', (payload = {}, ack) => {
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
    if (state.status !== 'voting') return reply({ ok: false, error: 'NOT_VOTING' });

    const voterId = socket.data.participantId;
    if (!state.activePool.includes(voterId)) return reply({ ok: false, error: 'NOT_IN_ROUND' });

    const entryId = Number(payload.entryId);
    const entry = state.entries.find((e) => e.entryId === entryId);
    if (!entry) return reply({ ok: false, error: 'INVALID_TARGET' });
    // 본인 작품에는 투표할 수 없다 (클라이언트에서도 막지만 서버가 최종 판단한다)
    if (entry.participantId === voterId) return reply({ ok: false, error: 'CANNOT_VOTE_SELF' });

    state.votes.set(voterId, entryId);
    reply({ ok: true });
    broadcastThrottled(io, code);
  });

  // 진행자가 '투표 결과 확인'을 누르면 득표수와 작성자가 공개된다.
  socket.on('acrostic:reveal', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'voting') return reply({ ok: false, error: 'NOT_VOTING' });

    state.ranking = rankEntries(state.entries, tallyVotes(state.votes));
    state.status = 'result';

    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('acrostic:advance', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'result' || !state.ranking) return reply({ ok: false, error: 'NOT_RESULT' });

    const event = getEventByCode(code);
    if (event) {
      // 아무도 투표하지 않았으면 전원이 0표 공동 1등이 되므로, 득표가 있는 1등만 점수를 받는다.
      const winners = state.ranking.filter((e) => e.rank === 1 && e.votes > 0);
      winners.forEach((e) => addScore(e.participantId, WIN_POINTS));

      createGameRecord({
        eventId: event.id,
        gameType: 'acrostic',
        result: {
          prompt: state.prompt,
          syllables: state.syllables,
          pointsAwarded: winners.length > 0 ? WIN_POINTS : 0,
          winners: winners.map((e) => toParticipantRef(e.participantId)),
          ranking: state.ranking.map((e) => ({
            ...toParticipantRef(e.participantId),
            lines: e.lines,
            votes: e.votes,
            rank: e.rank,
          })),
        },
      });
      broadcastScoreboard(io, code, event.id);
    }

    state.status = 'ended';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('acrostic:reset', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    games.set(code, createInitialState());
    reply({ ok: true });
    broadcastNow(io, code);
  });
}
