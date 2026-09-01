import { createGameRecord } from '../db/gameRecords.js';
import { getEventByCode } from '../db/events.js';
import { addScore, getParticipantById, listParticipantsByEvent } from '../db/participants.js';
import {
  COUNTDOWN_MS,
  controlById,
  decodeCells,
  difficultyById,
  goalDistances,
  mazeAt,
  pickMazeIndex,
  rankByProgress,
  rankFinishers,
  remainingAt,
  timeLimitById,
} from '../game/mazeEngine.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode, roleRoom } from './rooms.js';
import { broadcastScoreboard } from './scoreboard.js';

// 미로 찾기 실시간 상태 (yabawi.js 와 같은 구조).
//
// 핵심 두 가지:
//  1) 기록은 서버가 잰다. 참여자가 보낸 시간을 믿지 않고, 출발 시각과 완주 신호가
//     도착한 시각의 차이로 계산한다. 그래야 순위가 공정하다.
//  2) 시각은 서버 시계 기준으로 내려보낸다(startsAt/endsAt + serverNow). 각 폰의
//     시계가 제각각이라, 클라이언트는 serverNow 로 오차를 보정해서 카운트다운을 센다.
//     그래야 "3초 뒤 동시 출발"이 모든 폰에서 같은 순간이 된다.

const games = new Map(); // eventCode -> MazeGameState
const timers = new Map(); // eventCode -> { toRacing, toFinish, positions }

// 공 위치는 대형화면에만, 그것도 초당 12번만 보낸다.
// 폰이 60fps 로 쏘면 50명이면 초당 3000건이라 감당이 안 되고, 화면은 어차피
// 사이를 부드럽게 이어 그리므로 이 정도면 충분하다.
const POSITION_HZ = 12;
const POSITION_MS = Math.round(1000 / POSITION_HZ);

const MIN_PARTICIPANTS = 1; // 운영자가 혼자 리허설할 수 있어야 한다

function createInitialState() {
  return {
    // idle | ready | countdown | racing | finished | result | ended
    // 'ready' 는 진행자가 미로 게임을 펼쳐둔 상태다. 참여자가 기울기 허용을 미리
    // 눌러둘 수 있게 하려고 둔 단계 — 카운트다운 3초 안에 허용까지 하기엔 촉박하다.
    status: 'idle',
    difficulty: null, // 'normal' | 'hard' — 상은 벽에 닿으면 출발점으로
    control: null, // 'tilt' | 'buttons' — 진행자가 정해 전원 동일 조건
    limitMs: 0,
    mazeIndex: null,
    startsAt: null, // 카운트다운이 끝나고 실제로 출발하는 시각
    endsAt: null,
    activePool: [],
    colorOf: new Map(), // participantId -> 색 번호 (판 내내 고정)
    positions: new Map(), // participantId -> { x, y } (칸 단위) — 대형화면 중계용
    distToGoal: null, // 칸마다 "도착까지 남은 칸 수" (실시간 순위 기준)
    bestRemaining: new Map(), // participantId -> 그 판에서 도달했던 최소 '남은 칸'
    readyIds: [], // 기울기 허용을 마친 참여자 (진행자가 준비 상황을 보고 시작한다)
    finishes: new Map(), // participantId -> 걸린 시간(ms)
    ranking: null, // 결과 공개 때 계산
    rankedBy: null, // 'time' | 'progress' — 완주자가 없으면 진출 거리로 매긴다
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

function clearTimers(code) {
  const t = timers.get(code);
  if (!t) return;
  if (t.toRacing) clearTimeout(t.toRacing);
  if (t.toFinish) clearTimeout(t.toFinish);
  if (t.positions) clearInterval(t.positions);
  timers.delete(code);
}

function toParticipantRef(id) {
  const p = getParticipantById(id);
  return p ? { id: p.id, nickname: p.nickname } : { id, nickname: '알 수 없음' };
}

function publicState(state) {
  const revealed = state.status === 'result' || state.status === 'ended';

  return {
    status: state.status,
    readyIds: state.readyIds,
    difficulty: state.difficulty,
    control: state.control,
    limitMs: state.limitMs,
    // 미로 자체는 출발 전부터 내려준다 — 각 폰이 미리 그려두고 카운트다운을 봐야
    // 0초에 바로 굴릴 수 있다.
    maze: state.mazeIndex != null ? mazeAt(state.mazeIndex) : null,
    startsAt: state.startsAt,
    endsAt: state.endsAt,
    serverNow: Date.now(), // 각 폰이 시계 오차를 보정하는 기준
    activeParticipantIds: state.activePool,
    // 색은 판 내내 고정이라 상태에 같이 실어 보낸다. 참여자는 여기서 자기 색을,
    // 대형화면은 범례·순위표를 만든다.
    runners: state.activePool.map((id) => ({
      ...toParticipantRef(id),
      participantId: id,
      colorIndex: state.colorOf.get(id) ?? 0,
    })),
    // 경기 중에는 "누가 들어왔는지"만 보여준다 (기록은 결과 공개 때 한꺼번에).
    finishedParticipantIds: [...state.finishes.keys()],
    ranking: revealed && state.ranking
      ? state.ranking.map((r) => ({ ...toParticipantRef(r.participantId), ...r }))
      : null,
    rankedBy: revealed ? state.rankedBy : null,
  };
}

function broadcastNow(io, code) {
  io.to(eventRoom(code)).emit('maze:state', publicState(getState(code)));
}

export function getMazeSnapshot(eventCode) {
  return publicState(getState(eventCode));
}

/** 재접속 시 이 참여자가 이미 완주했는지 되살린다. */
export function getYourMazeFinish(eventCode, participantId) {
  const state = getState(eventCode);
  return state.finishes.has(participantId) ? state.finishes.get(participantId) : null;
}

/**
 * 지금 누가 어디쯤인지 대형화면에 보낸다.
 * 순위는 "도착까지 남은 칸 수"로 매긴다 — 직선거리로 재면 도착 옆인데 벽에 막혀
 * 한참 돌아가야 하는 사람이 1등으로 보인다.
 */
function broadcastPositions(io, code) {
  const state = getState(code);
  if (state.status !== 'racing' || !state.distToGoal) return;

  const runners = state.activePool.map((id) => {
    const finishedMs = state.finishes.get(id) ?? null;
    const pos = state.positions.get(id) ?? { x: 0.5, y: 0.5 };
    return {
      participantId: id,
      x: pos.x,
      y: pos.y,
      // 완주자는 남은 칸 0 으로 고정해 순위표 맨 위에 그대로 남는다
      remaining: finishedMs != null ? 0 : remainingAt(state.distToGoal, pos.x, pos.y),
      finishedMs,
    };
  });

  runners.sort((a, b) => a.remaining - b.remaining || (a.finishedMs ?? Infinity) - (b.finishedMs ?? Infinity));

  io.to(roleRoom(code, 'screen')).emit('maze:positions', { runners, at: Date.now() });
}

/** 제한시간이 끝났거나 전원이 완주했을 때 경기를 닫는다. */
function finishRace(io, code) {
  const state = getState(code);
  if (state.status !== 'racing') return;
  clearTimers(code);
  state.status = 'finished';
  broadcastNow(io, code);
}

export function registerMazeHandlers(io, socket) {
  socket.on('maze:start', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status === 'countdown' || state.status === 'racing') {
      return reply({ ok: false, error: 'RACE_IN_PROGRESS' });
    }

    const difficulty = difficultyById(String(payload.difficulty ?? ''));
    if (!difficulty) return reply({ ok: false, error: 'INVALID_DIFFICULTY' });

    const control = controlById(String(payload.control ?? ''));
    if (!control) return reply({ ok: false, error: 'INVALID_CONTROL' });

    const limit = timeLimitById(payload.limitSec);
    if (!limit) return reply({ ok: false, error: 'INVALID_LIMIT' });

    const event = getEventByCode(code);
    if (!event) return reply({ ok: false, error: 'EVENT_NOT_FOUND' });

    const active = listParticipantsByEvent(event.id).filter((p) => p.status === 'active');
    if (active.length < MIN_PARTICIPANTS) return reply({ ok: false, error: 'NOT_ENOUGH_PARTICIPANTS' });

    clearTimers(code);
    const now = Date.now();
    state.status = 'countdown';
    state.difficulty = difficulty.id;
    state.control = control.id;
    state.limitMs = limit.id * 1000;
    state.mazeIndex = pickMazeIndex();
    state.startsAt = now + COUNTDOWN_MS;
    state.endsAt = now + COUNTDOWN_MS + state.limitMs;
    state.activePool = active.map((p) => p.id);
    state.colorOf = new Map(state.activePool.map((id, i) => [id, i]));
    state.positions = new Map(state.activePool.map((id) => [id, { x: 0.5, y: 0.5 }]));
    state.distToGoal = goalDistances(decodeCells(mazeAt(state.mazeIndex)));
    // 출발점의 남은 칸으로 시작 — 한 칸도 못 가면 이 값이 그대로 기록된다
    const startRemaining = remainingAt(state.distToGoal, 0.5, 0.5);
    state.bestRemaining = new Map(state.activePool.map((id) => [id, startRemaining]));
    state.finishes = new Map();
    state.ranking = null;
    state.rankedBy = null;

    reply({ ok: true });
    broadcastNow(io, code);

    // 클라이언트 보고를 기다리지 않고 서버가 스스로 넘어간다 (야바위와 같은 방식).
    const toRacing = setTimeout(() => {
      const cur = getState(code);
      if (cur.status !== 'countdown') return;
      cur.status = 'racing';
      broadcastNow(io, code);
    }, COUNTDOWN_MS);

    const toFinish = setTimeout(() => finishRace(io, code), COUNTDOWN_MS + state.limitMs);
    // 모아서 대형화면에만 내려보낸다 (참여자 폰은 자기 공만 보므로 받을 이유가 없다)
    const positions = setInterval(() => broadcastPositions(io, code), POSITION_MS);
    timers.set(code, { toRacing, toFinish, positions });
  });

  // 진행자가 미로 게임을 펼치면 참여자 폰에 '기울기 허용' 버튼을 띄운다.
  // 시작을 누른 뒤에 허용하게 하면 카운트다운 3초 안에 팝업까지 처리해야 해서 늦는다.
  socket.on('maze:prepare', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'idle') return reply({ ok: true }); // 이미 진행 중이면 건드리지 않는다

    state.status = 'ready';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  /** 진행자가 다른 게임으로 넘어가면 참여자 화면에서도 치운다. */
  socket.on('maze:unprepare', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'ready') return reply({ ok: true });

    state.status = 'idle';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  /** 참여자가 기울기 허용을 마쳤다고 알린다 (진행자가 준비 인원을 보려고). */
  socket.on('maze:ready', (payload = {}, ack) => {
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
    const id = socket.data.participantId;
    if (state.readyIds.includes(id)) return reply({ ok: true });

    state.readyIds = [...state.readyIds, id];
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('maze:finish', (payload = {}, ack) => {
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
    if (state.status !== 'racing') return reply({ ok: false, error: 'NOT_RACING' });

    const id = socket.data.participantId;
    if (!state.activePool.includes(id)) return reply({ ok: false, error: 'NOT_IN_RACE' });
    if (state.finishes.has(id)) return reply({ ok: false, error: 'ALREADY_FINISHED' });

    // 걸린 시간은 서버가 잰다 (클라이언트가 보낸 값은 쓰지 않는다)
    const elapsedMs = Math.max(0, Date.now() - state.startsAt);
    state.finishes.set(id, elapsedMs);
    state.bestRemaining.set(id, 0);

    reply({ ok: true, elapsedMs });

    // 전원이 들어왔으면 제한시간을 기다리지 않고 바로 닫는다
    if (state.finishes.size >= state.activePool.length) finishRace(io, code);
    else broadcastNow(io, code);
  });

  // 공 위치 보고 — ack 를 돌려주지 않는다. 초당 12번씩 오는 것이라 왕복을 만들면
  // 그 자체가 부담이고, 한 번쯤 빠져도 다음 것이 곧 온다.
  socket.on('maze:pos', (payload = {}) => {
    const code = normalizeEventCode(payload.eventCode);
    if (
      socket.data.role !== 'player' ||
      !socket.data.participantId ||
      socket.data.eventCode !== code
    ) return;

    const state = getState(code);
    if (state.status !== 'racing') return;

    const id = socket.data.participantId;
    if (!state.positions.has(id)) return; // 이번 판 참가자가 아니다
    if (state.finishes.has(id)) return; // 이미 들어온 사람은 더 안 움직인다

    const x = Number(payload.x);
    const y = Number(payload.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    state.positions.set(id, { x, y });

    // 이 판에서 가장 멀리 간 지점을 기억해 둔다. '상' 난이도는 벽에 닿을 때마다
    // 출발점으로 돌아가므로, 끝난 순간의 위치로는 누가 잘했는지 알 수 없다.
    if (state.distToGoal) {
      const now = remainingAt(state.distToGoal, x, y);
      const best = state.bestRemaining.get(id);
      if (best === undefined || now < best) state.bestRemaining.set(id, now);
    }
  });

  // 결과 보기 — 여기서 순위가 확정되고 점수가 들어간다
  socket.on('maze:reveal', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'finished' && state.status !== 'racing') {
      return reply({ ok: false, error: 'NOT_FINISHED' });
    }

    clearTimers(code);
    const scale = difficultyById(state.difficulty)?.pointsScale ?? 1;
    if (state.finishes.size > 0) {
      state.ranking = rankFinishers(state.finishes, scale);
      state.rankedBy = 'time';
    } else {
      // 아무도 못 들어왔으면 판이 통째로 허무해지지 않도록 진출 거리로 순위를 낸다
      state.ranking = rankByProgress(state.bestRemaining, scale);
      state.rankedBy = 'progress';
    }

    const event = getEventByCode(code);
    if (event) {
      state.ranking.forEach((r) => addScore(r.participantId, r.points));
      broadcastScoreboard(io, code, event.id);
    }

    state.status = 'result';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('maze:end', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'result') return reply({ ok: false, error: 'NOT_RESULT' });

    const event = getEventByCode(code);
    if (event) {
      createGameRecord({
        eventId: event.id,
        gameType: 'maze',
        result: {
          difficulty: state.difficulty,
          rankedBy: state.rankedBy,
          control: state.control,
          limitSec: state.limitMs / 1000,
          mazeIndex: state.mazeIndex,
          entrants: state.activePool.length,
          ranking: state.ranking.map((r) => ({ ...toParticipantRef(r.participantId), ...r })),
        },
      });
    }

    state.status = 'ended';
    reply({ ok: true });
    broadcastNow(io, code);
  });

  socket.on('maze:reset', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    clearTimers(code);
    games.set(code, createInitialState());
    reply({ ok: true });
    broadcastNow(io, code);
  });
}
