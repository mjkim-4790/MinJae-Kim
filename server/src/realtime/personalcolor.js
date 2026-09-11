import { createGameRecord } from '../db/gameRecords.js';
import { getEventByCode } from '../db/events.js';
import { getParticipantById, listParticipantsByEvent } from '../db/participants.js';
// 색 변환은 색깔 사냥이 쓰는 파일을 그대로 쓴다 (두 벌 두지 않는다)
import { hexToOklch } from '../game/color.js';
import { DRAPES, TYPES, classify } from '../game/personalColorEngine.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode } from './rooms.js';

// '퍼스널컬러 찾아보기' 실시간 상태.
//
// 게임이 아니라 쉬어가는 코너다. 점수도 승패도 없다 (운영 결정).
//
// 아이패드 한 대 앞에 한 명씩 서서, **자기 얼굴을 보면서** 얼굴 옆에 색을 대본다.
// 두 색 중 나은 쪽을 본인이 고르고, 카메라가 읽은 피부톤은 한 표만 거든다.
//
// ── 얼굴은 남지 않는다 ─────────────────────────────────────────────────────
// 화면에 보이는 건 실시간 미리보기뿐이다. 캡처도, 저장도, 전송도 하지 않는다.
// 서버로 오는 건 고른 쪽('a'|'b')과 피부톤 hex 하나가 전부다.

const rooms = new Map();

function createInitialState() {
  return {
    status: 'idle', // idle | ready | active | result | ended
    currentId: null,
    step: 0, // 지금 몇 번째 드레이프인지
    answers: {}, // drapeId -> 'a' | 'b'
    skinHex: null,
    lastResult: null,
    history: [], // { participantId, nickname, typeId }
    doneIds: [],
  };
}

function getState(eventCode) {
  const code = normalizeEventCode(eventCode);
  let s = rooms.get(code);
  if (!s) {
    s = createInitialState();
    rooms.set(code, s);
  }
  return s;
}

function nicknameOf(id) {
  return id == null ? null : getParticipantById(id)?.nickname ?? '알 수 없음';
}

/** 유형별로 몇 명인지 — 다 끝나고 "우리 중 여름 쿨이 몇 명" 을 보여줄 때 쓴다. */
function tally(history) {
  const counts = new Map();
  for (const h of history) counts.set(h.typeId, (counts.get(h.typeId) ?? 0) + 1);
  return TYPES.filter((t) => counts.has(t.id)).map((t) => ({
    id: t.id,
    name: t.name,
    count: counts.get(t.id),
    nicknames: history.filter((h) => h.typeId === t.id).map((h) => h.nickname),
  }));
}

function publicState(state) {
  return {
    status: state.status,
    currentId: state.currentId,
    currentNickname: nicknameOf(state.currentId),
    doneIds: state.doneIds,
    step: state.step,
    total: DRAPES.length,
    // 지금 물어볼 드레이프만 내려준다 (앞으로 나올 걸 미리 보여줄 이유가 없다)
    drape: state.status === 'active' ? DRAPES[state.step] ?? null : null,
    answers: state.answers,
    lastResult: state.lastResult,
    doneCount: state.history.length,
    tally: tally(state.history),
  };
}

function broadcast(io, code) {
  io.to(eventRoom(code)).emit('personalcolor:state', publicState(getState(code)));
}

export function getPersonalColorSnapshot(eventCode) {
  return publicState(getState(eventCode));
}

/** 아이패드(스크린)나 진행자 노트북이 답과 피부톤을 보낼 수 있다. */
function canAnswer(socket, code) {
  if (isAuthorizedOperator(socket, code)) return true;
  return socket.data.role === 'screen' && socket.data.eventCode === normalizeEventCode(code);
}

export function registerPersonalColorHandlers(io, socket) {
  socket.on('personalcolor:setup', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status !== 'idle' && state.status !== 'ready') return reply({ ok: true });
    state.status = 'ready';
    reply({ ok: true });
    broadcast(io, code);
  });

  socket.on('personalcolor:leave', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status !== 'ready') return reply({ ok: true });
    state.status = 'idle';
    state.currentId = null;
    reply({ ok: true });
    broadcast(io, code);
  });

  socket.on('personalcolor:call', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status === 'active') return reply({ ok: false, error: 'TURN_IN_PROGRESS' });

    const id = Number(payload.participantId);
    const event = getEventByCode(code);
    if (!event) return reply({ ok: false, error: 'EVENT_NOT_FOUND' });
    if (!listParticipantsByEvent(event.id).some((p) => p.id === id && p.status === 'active')) {
      return reply({ ok: false, error: 'NOT_A_PARTICIPANT' });
    }

    state.currentId = id;
    state.status = 'ready';
    state.lastResult = null;
    reply({ ok: true });
    broadcast(io, code);
  });

  socket.on('personalcolor:start', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status === 'active') return reply({ ok: false, error: 'TURN_IN_PROGRESS' });
    if (state.currentId == null) return reply({ ok: false, error: 'NOBODY_CALLED' });

    state.status = 'active';
    state.step = 0;
    state.answers = {};
    state.skinHex = null;
    state.lastResult = null;
    reply({ ok: true });
    broadcast(io, code);
  });

  /** 카메라가 읽은 피부톤. 한 표만 거들고, 없어도 진행된다. */
  socket.on('personalcolor:skin', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!canAnswer(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status !== 'active') return reply({ ok: false, error: 'NOT_ACTIVE' });

    const hex = String(payload.hex ?? '');
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return reply({ ok: false, error: 'INVALID_HEX' });
    state.skinHex = hex.toLowerCase();
    reply({ ok: true });
  });

  /** 드레이프 하나를 골랐다. 마지막이면 결과가 나온다. */
  socket.on('personalcolor:answer', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!canAnswer(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'active') return reply({ ok: false, error: 'NOT_ACTIVE' });

    const drape = DRAPES[state.step];
    if (!drape) return reply({ ok: false, error: 'NO_DRAPE' });
    const choice = payload.choice === 'a' ? 'a' : payload.choice === 'b' ? 'b' : null;
    if (!choice) return reply({ ok: false, error: 'INVALID_CHOICE' });

    state.answers = { ...state.answers, [drape.id]: choice };
    state.step += 1;

    if (state.step < DRAPES.length) {
      reply({ ok: true, step: state.step });
      broadcast(io, code);
      return;
    }

    // 다 골랐다 — 유형을 낸다. 판정은 여기서만 한다 (아이패드가 보낸 결과는 받지 않는다).
    finish(io, code);
    reply({ ok: true, done: true });
  });

  /** 진행자가 중간에 끊는다 (자리를 비웠거나 다음 사람으로 넘길 때). */
  socket.on('personalcolor:skip', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status !== 'active') return reply({ ok: false, error: 'NOT_ACTIVE' });
    // 고른 데까지만으로 낸다 — 아무것도 안 골랐어도 기본값으로 나온다
    finish(io, code);
    reply({ ok: true });
  });

  socket.on('personalcolor:next', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status !== 'result') return reply({ ok: false, error: 'NOT_RESULT' });
    state.status = 'ready';
    state.currentId = null;
    reply({ ok: true });
    broadcast(io, code);
  });

  socket.on('personalcolor:end', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status === 'idle' || state.status === 'ended') {
      return reply({ ok: false, error: 'NOT_RUNNING' });
    }

    const event = getEventByCode(code);
    if (event) {
      createGameRecord({
        eventId: event.id,
        gameType: 'personalcolor',
        result: {
          done: state.history.length,
          // 얼굴도 피부톤도 남기지 않는다 — 누가 어떤 유형이었는지만 남긴다
          people: state.history.map((h) => ({ nickname: h.nickname, type: h.typeName })),
          tally: tally(state.history).map((t) => ({ name: t.name, count: t.count })),
        },
      });
    }

    state.status = 'ended';
    reply({ ok: true });
    broadcast(io, code);
  });

  socket.on('personalcolor:reset', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    rooms.set(code, createInitialState());
    reply({ ok: true });
    broadcast(io, code);
  });
}

/** 지금까지 고른 것으로 유형을 내고 결과 화면으로 넘긴다. */
function finish(io, code) {
  const state = getState(code);
  const skin = state.skinHex ? hexToOklch(state.skinHex) : null;
  const { type, reason } = classify(state.answers, skin);

  state.lastResult = {
    participantId: state.currentId,
    nickname: nicknameOf(state.currentId),
    typeId: type.id,
    typeName: type.name,
    desc: type.desc,
    palette: type.palette,
    avoid: type.avoid,
    reason,
    skinHex: state.skinHex,
  };
  if (state.currentId != null) {
    state.history.push({
      participantId: state.currentId,
      nickname: nicknameOf(state.currentId),
      typeId: type.id,
      typeName: type.name,
    });
    if (!state.doneIds.includes(state.currentId)) {
      state.doneIds = [...state.doneIds, state.currentId];
    }
  }
  state.status = 'result';
  broadcast(io, code);
}
