import { createGameRecord } from '../db/gameRecords.js';
import { getEventByCode } from '../db/events.js';
import { addScore, getParticipantById, listParticipantsByEvent } from '../db/participants.js';
import { MAX_CHART_LEN, isValidChart, scoreRun } from '../game/fruitEngine.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode, roleRoom } from './rooms.js';
import { broadcastScoreboard } from './scoreboard.js';

// '리듬 과일 자르기' 실시간 상태.
//
// 아이패드 한 대 앞에 한 명씩 서서, 노래에 맞춰 날아오는 과일을 손으로 휘둘러 자른다.
//
// ── 왜 한 대에서 다 하는가 ────────────────────────────────────────────────
// 리듬 게임의 가장 어려운 문제는 소리와 화면의 박자를 맞추는 것이다. 음악을 대형
// 화면에서 틀고 과일을 각자 폰에 띄우면 기기마다 수십 ms 씩 어긋나고, 그 정도면
// "박자가 논다"가 된다 (기존 시계 맞추기는 왕복 시간을 빼지 않아 행사장 와이파이
// 에서 오차가 더 커진다). 음악·과일·판정을 한 기기에 두면 그 문제가 통째로 사라진다.
//
// ── 음원은 서버로 오지 않는다 ─────────────────────────────────────────────
// 진행자가 아이패드에서 직접 음원 파일을 고르고, 분석도 재생도 그 안에서 한다.
// 서버로 오는 건 분석 결과인 **숫자 시각표(차트)** 뿐이다. 영상도 음원도 오지 않는다.
//
// ── 판정은 아이패드가, 점수는 서버가 ──────────────────────────────────────
// 자르는 순간의 판정만은 아이패드가 할 수밖에 없다(서버엔 영상이 없다). 대신
// 아이패드는 '몇 번 과일을 몇 ms 오차로 쳤는지'만 보내고, 점수·콤보는 서버가
// 차트를 들고 다시 계산한다. 없는 과일을 쳤다거나 같은 걸 두 번 쳤다는 주장은
// 서버가 걸러낸다.

const rooms = new Map();

function createInitialState() {
  return {
    status: 'idle', // idle | ready | playing | result | ended
    currentId: null,
    chart: null, // 아이패드가 곡을 고르고 분석해서 올려준 시각표
    songName: null,
    bpm: null,
    hits: [], // [{ i, dtMs }]
    lastResult: null,
    history: [], // { participantId, nickname, score, maxCombo }
    doneIds: [],
    earned: new Map(),
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

/** 사진도 차트도 없는 가벼운 상태 — 참가자 폰·진행자에게 간다. */
function lightState(state) {
  return {
    status: state.status,
    currentId: state.currentId,
    currentNickname: nicknameOf(state.currentId),
    doneIds: state.doneIds,
    doneCount: state.history.length,
    songName: state.songName,
    bpm: state.bpm ? Math.round(state.bpm) : null,
    hasChart: !!state.chart,
    chartLength: state.chart?.length ?? 0,
    lastResult: state.lastResult,
    ranking:
      state.status === 'ended'
        ? [...state.earned.entries()]
            .map(([participantId, points]) => ({ participantId, nickname: nicknameOf(participantId), points }))
            .sort((a, b) => b.points - a.points)
        : null,
  };
}

/**
 * 아이패드에만 가는 상태 — 차트가 들어 있다.
 * 200개 남짓한 숫자 덩어리라, 대기 중인 폰 수십 대에까지 뿌릴 이유가 없다.
 */
function screenState(state) {
  return { ...lightState(state), chart: state.chart };
}

function broadcastLight(io, code) {
  io.to(eventRoom(code)).emit('fruit:state', lightState(getState(code)));
}

function broadcastScreen(io, code) {
  io.to(roleRoom(code, 'screen')).emit('fruit:state', screenState(getState(code)));
}

function broadcastAll(io, code) {
  broadcastLight(io, code);
  broadcastScreen(io, code);
}

export function getFruitSnapshot(eventCode, role) {
  const state = getState(eventCode);
  // 아이패드는 곡 도중에 새로고침해도 차트를 되찾아야 한다
  return role === 'screen' ? screenState(state) : lightState(state);
}

/** 아이패드(스크린)만 차트를 올리고 타격을 보고할 수 있다. */
function isScreen(socket, code) {
  return socket.data.role === 'screen' && socket.data.eventCode === normalizeEventCode(code);
}

export function registerFruitHandlers(io, socket) {
  socket.on('fruit:setup', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status !== 'idle' && state.status !== 'ready') return reply({ ok: true });
    state.status = 'ready';
    reply({ ok: true });
    broadcastAll(io, code);
  });

  socket.on('fruit:leave', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status !== 'ready') return reply({ ok: true });
    state.status = 'idle';
    state.currentId = null;
    reply({ ok: true });
    broadcastAll(io, code);
  });

  /** 아이패드가 곡을 골라 분석한 결과. 재생 전에 한 번 올린다. */
  socket.on('fruit:chart', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isScreen(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status === 'playing') return reply({ ok: false, error: 'TURN_IN_PROGRESS' });

    const chart = payload.chart;
    if (!isValidChart(chart)) return reply({ ok: false, error: 'INVALID_CHART' });

    // 차트에서 서버가 쓰는 것만 남긴다 (아이패드가 뭘 더 붙여 보내도 저장하지 않는다)
    state.chart = chart.map((n) => ({ t: n.t, x: n.x, type: n.type, kind: String(n.kind ?? '').slice(0, 4), drift: Number(n.drift) || 0 }));
    state.songName = String(payload.songName ?? '').slice(0, 80) || null;
    state.bpm = Number(payload.bpm) || null;
    reply({ ok: true, length: state.chart.length });
    broadcastAll(io, code);
  });

  socket.on('fruit:call', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status === 'playing') return reply({ ok: false, error: 'TURN_IN_PROGRESS' });

    const id = Number(payload.participantId);
    const event = getEventByCode(code);
    if (!event) return reply({ ok: false, error: 'EVENT_NOT_FOUND' });
    if (!listParticipantsByEvent(event.id).some((p) => p.id === id && p.status === 'active')) {
      return reply({ ok: false, error: 'NOT_A_PARTICIPANT' });
    }

    state.currentId = id;
    state.status = 'ready';
    state.lastResult = null;
    state.hits = [];
    reply({ ok: true });
    broadcastAll(io, code);
  });

  socket.on('fruit:start', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status === 'playing') return reply({ ok: false, error: 'TURN_IN_PROGRESS' });
    if (state.currentId == null) return reply({ ok: false, error: 'NOBODY_CALLED' });
    if (!state.chart) return reply({ ok: false, error: 'NO_CHART' });

    state.status = 'playing';
    state.hits = [];
    state.lastResult = null;
    reply({ ok: true });
    broadcastAll(io, code);
  });

  /**
   * 아이패드가 과일 하나를 쳤다고 보고한다.
   * 점수는 여기서 차트를 보고 다시 계산한다 — 아이패드가 보낸 점수는 받지 않는다.
   */
  socket.on('fruit:hit', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isScreen(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status !== 'playing') return reply({ ok: false, error: 'NOT_PLAYING' });
    if (state.hits.length >= MAX_CHART_LEN) return reply({ ok: false, error: 'TOO_MANY' });

    state.hits.push({ i: Number(payload.i), dtMs: Number(payload.dtMs) });
    // 한 벌의 계산만 쓴다 — 실시간 표시와 최종 점수가 어긋날 여지를 없앤다
    const live = scoreRun(state.chart, state.hits);
    reply({ ok: true, ...live });
    // 화면에만 보낸다 (초당 두세 번이라 이벤트 전체에 뿌릴 이유가 없다)
    io.to(roleRoom(code, 'screen')).emit('fruit:live', live);
  });

  /** 곡이 끝났다. 최종 점수를 확정한다. */
  socket.on('fruit:finish', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isScreen(socket, code) && !isAuthorizedOperator(socket, code)) {
      return reply({ ok: false, error: 'FORBIDDEN' });
    }
    const state = getState(code);
    if (state.status !== 'playing') return reply({ ok: false, error: 'NOT_PLAYING' });

    const run = scoreRun(state.chart, state.hits);
    const id = state.currentId;
    state.lastResult = {
      participantId: id,
      nickname: nicknameOf(id),
      songName: state.songName,
      ...run,
    };
    if (id != null) {
      state.history.push({ participantId: id, nickname: nicknameOf(id), score: run.score, maxCombo: run.maxCombo });
      if (!state.doneIds.includes(id)) state.doneIds = [...state.doneIds, id];
      state.earned.set(id, (state.earned.get(id) ?? 0) + run.score);
      if (run.score > 0) {
        addScore(id, run.score);
        broadcastScoreboard(io, code);
      }
    }
    state.status = 'result';
    reply({ ok: true, ...run });
    broadcastAll(io, code);
  });

  socket.on('fruit:next', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    const state = getState(code);
    if (state.status !== 'result') return reply({ ok: false, error: 'NOT_RESULT' });
    state.status = 'ready';
    state.currentId = null;
    state.hits = [];
    reply({ ok: true });
    broadcastAll(io, code);
  });

  socket.on('fruit:end', (payload = {}, ack) => {
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
        gameType: 'fruit',
        result: {
          done: state.history.length,
          song: state.songName,
          people: state.history.map((h) => ({ nickname: h.nickname, score: h.score, maxCombo: h.maxCombo })),
        },
      });
    }

    state.status = 'ended';
    reply({ ok: true });
    broadcastAll(io, code);
  });

  socket.on('fruit:reset', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
    rooms.set(code, createInitialState());
    reply({ ok: true });
    broadcastAll(io, code);
  });
}
