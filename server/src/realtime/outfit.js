import { createGameRecord } from '../db/gameRecords.js';
import { getEventByCode } from '../db/events.js';
import { getParticipantById, listParticipantsByEvent } from '../db/participants.js';
import { MAX_OUTFITS, canAddMore, isValidImage } from '../game/outfitEngine.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode, roleRoom } from './rooms.js';

// '옷 입어보기' 실시간 상태.
//
// 게임이 아니라 쉬어가는 코너다. 점수도 판정도 없다 (운영 결정).
//
// 아이패드 한 대 앞에 한 명씩 서서, **자기 모습을 실시간으로 보면서** 폰으로 올린
// 옷 사진을 몸에 대본다. 여러 벌 올려두고 아이패드에서 눌러가며 갈아입는다.
//
// ── 사진은 서버 메모리에만, 이번 사람이 끝나면 버려진다 ────────────────────
// 다른 카메라 코너는 이미지를 서버에 안 보내지만, 이 코너는 옷 사진을 아이패드에
// 띄워야 해서 예외적으로 이미지가 서버를 거친다. 대신 디스크에는 절대 쓰지 않고
// (game_records 에도 이미지·파일명을 남기지 않는다), 다음 사람을 부르거나
// 코너를 리셋하면 그 사람의 사진은 통째로 사라진다.
//
// ── 두 갈래로 방송한다 ──────────────────────────────────────────────────────
// 옷 사진이 든 상태를 이벤트 전체에 뿌리면 대기 중인 모든 참가자 폰이 남의 옷
// 사진을 받는 꼴이 된다 (사람이 많으면 그 폰들만으로도 트래픽이 크다).
// 그래서 사진은 **아이패드(스크린)에만** 따로 보내고, 나머지에게는 사진 없이
// 가벼운 상태(누구 차례인지, 몇 장 올렸는지 개수)만 보낸다.

const rooms = new Map();

function createInitialState() {
  return {
    status: 'idle', // idle | ready | active | ended
    currentId: null,
    outfits: [], // { id, dataUrl } — 이번 사람이 올린 옷들 (다음 사람으로 넘어가면 비운다)
    selectedId: null,
    nextOutfitSeq: 1,
    doneIds: [],
    doneCount: 0,
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

/** 사진 없이 — 참가자 전원에게 보내는 가벼운 상태. */
function lightState(state) {
  return {
    status: state.status,
    currentId: state.currentId,
    currentNickname: nicknameOf(state.currentId),
    doneIds: state.doneIds,
    doneCount: state.doneCount,
    outfitCount: state.outfits.length,
    maxOutfits: MAX_OUTFITS,
    selectedId: state.selectedId,
  };
}

/** 사진 포함 — 아이패드(스크린)에만 보내는 상태. */
function screenState(state) {
  return {
    ...lightState(state),
    outfits: state.outfits.map((o) => ({ id: o.id, dataUrl: o.dataUrl })),
  };
}

function broadcastLight(io, code) {
  io.to(eventRoom(code)).emit('outfit:state', lightState(getState(code)));
}

/** 아이패드에만 사진이 든 상태를 다시 보낸다. 참가자/진행자에게는 가벼운 쪽만 간다. */
function broadcastScreen(io, code) {
  io.to(roleRoom(code, 'screen')).emit('outfit:state', screenState(getState(code)));
}

function broadcastAll(io, code) {
  broadcastLight(io, code);
  broadcastScreen(io, code);
}

/**
 * 접속 직후(session:hello) 돌려줄 스냅샷.
 *
 * 처음에는 "아이패드는 접속 직후 사진이 없으니 가벼운 쪽만 줘도 된다"고 생각했는데,
 * 실제로 새로고침해보니 **이미 누가 옷을 여러 벌 올려둔 도중에** 아이패드가
 * 재접속하는 경우가 있었다 — 그때 가벼운 상태만 주면 다음 액션(옷 선택 등)이
 * 일어나기 전까지 화면에 옷 줄이 하나도 안 뜬다. 그래서 요청한 쪽이 아이패드
 * (스크린) 역할이면 사진이 든 쪽을 돌려준다.
 */
export function getOutfitSnapshot(eventCode, role) {
  const state = getState(eventCode);
  return role === 'screen' ? screenState(state) : lightState(state);
}

function isCurrentPlayer(socket, code, state) {
  return (
    socket.data.role === 'player' &&
    socket.data.eventCode === normalizeEventCode(code) &&
    socket.data.participantId === state.currentId
  );
}

/** 옷을 고르는 동작은 아이패드(스크린)에서 일어난다 — 진행자도 대신할 수 있다. */
function canSelect(socket, code) {
  if (isAuthorizedOperator(socket, code)) return true;
  return socket.data.role === 'screen' && socket.data.eventCode === normalizeEventCode(code);
}

export function registerOutfitHandlers(io, socket) {
  socket.on('outfit:setup', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status !== 'idle' && state.status !== 'ready') return reply({ ok: true });
    state.status = 'ready';
    reply({ ok: true });
    broadcastAll(io, code);
  });

  socket.on('outfit:leave', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status !== 'ready') return reply({ ok: true });
    state.status = 'idle';
    state.currentId = null;
    state.outfits = [];
    state.selectedId = null;
    reply({ ok: true });
    broadcastAll(io, code);
  });

  socket.on('outfit:call', (payload = {}, ack) => {
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

    // 이전 사람 사진은 여기서 이미 지워져 있어야 하지만, 혹시 남아 있으면 확실히 비운다
    state.currentId = id;
    state.status = 'ready';
    state.outfits = [];
    state.selectedId = null;
    reply({ ok: true });
    broadcastAll(io, code);
  });

  /** 호출된 사람이 아이패드 앞에 서서 시작한다 — 이때부터 그 사람 폰에 업로드 화면이 뜬다. */
  socket.on('outfit:start', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status === 'active') return reply({ ok: false, error: 'TURN_IN_PROGRESS' });
    if (state.currentId == null) return reply({ ok: false, error: 'NOBODY_CALLED' });
    state.status = 'active';
    reply({ ok: true });
    broadcastAll(io, code);
  });

  /**
   * 폰이 옷 사진을 올린다.
   *
   * 사진은 폰에서 이미 800px 이하로 줄이고 JPEG 로 인코딩해서 보낸다. 그래도
   * 여기서 다시 크기를 확인한다 — 폰이 시키는 대로 하지 않았을 때의 방어선이다.
   * 어디에도 쓰지 않고 이번 세션의 메모리에만 담는다.
   */
  socket.on('outfit:upload', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    const state = getState(code);
    if (!isCurrentPlayer(socket, code, state)) return reply({ ok: false, error: 'FORBIDDEN' });
    if (state.status !== 'active' && state.status !== 'ready') {
      return reply({ ok: false, error: 'NOT_ACTIVE' });
    }
    if (!canAddMore(state.outfits.length)) return reply({ ok: false, error: 'TOO_MANY' });
    if (!isValidImage(payload.dataUrl)) return reply({ ok: false, error: 'INVALID_IMAGE' });

    const id = state.nextOutfitSeq++;
    state.outfits = [...state.outfits, { id, dataUrl: payload.dataUrl }];
    // 처음 올린 사진은 바로 입혀본다 — 매번 따로 눌러야 하면 번거롭다
    if (state.selectedId == null) state.selectedId = id;

    reply({ ok: true, id, count: state.outfits.length });
    broadcastAll(io, code);
  });

  /** 아이패드에서 옷을 눌러 갈아입는다. */
  socket.on('outfit:select', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!canSelect(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    const id = payload.outfitId == null ? null : Number(payload.outfitId);
    if (id != null && !state.outfits.some((o) => o.id === id)) {
      return reply({ ok: false, error: 'NOT_FOUND' });
    }
    state.selectedId = id;
    reply({ ok: true });
    broadcastAll(io, code);
  });

  /** 진행자가 이 사람 차례를 마친다. */
  socket.on('outfit:next', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status !== 'active' && state.status !== 'ready') {
      return reply({ ok: false, error: 'NOT_ACTIVE' });
    }
    if (state.currentId != null && !state.doneIds.includes(state.currentId)) {
      state.doneIds = [...state.doneIds, state.currentId];
      state.doneCount += 1;
    }
    // 사진은 여기서 확실히 버린다 — 다음 사람이 이전 사람 옷을 볼 이유가 없다
    state.outfits = [];
    state.selectedId = null;
    state.currentId = null;
    state.status = 'ready';
    reply({ ok: true });
    broadcastAll(io, code);
  });

  socket.on('outfit:end', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status === 'idle' || state.status === 'ended') {
      return reply({ ok: false, error: 'NOT_RUNNING' });
    }

    const event = getEventByCode(code);
    if (event) {
      // 사진은 물론이고 파일명조차 남기지 않는다 — 몇 명이 해봤는지만 기록한다
      createGameRecord({
        eventId: event.id,
        gameType: 'outfit',
        result: { done: state.doneCount },
      });
    }

    state.status = 'ended';
    state.currentId = null;
    state.outfits = [];
    state.selectedId = null;
    reply({ ok: true });
    broadcastAll(io, code);
  });

  socket.on('outfit:reset', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    rooms.set(code, createInitialState());
    reply({ ok: true });
    broadcastAll(io, code);
  });
}
