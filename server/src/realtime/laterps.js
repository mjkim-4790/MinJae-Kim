import { createGameRecord } from '../db/gameRecords.js';
import { getEventByCode } from '../db/events.js';
import { addScore, getParticipantById, listParticipantsByEvent } from '../db/participants.js';
import {
  BEAT_GAP_MS,
  HANDS,
  READY_MS,
  REVEAL_GAP_MS,
  difficultyById,
  isCorrect,
  pointsFor,
  rollTurn,
} from '../game/laterpsEngine.js';
import { isAuthorizedOperator } from './authz.js';
import { eventRoom, normalizeEventCode } from './rooms.js';
import { broadcastScoreboard } from './scoreboard.js';

// '후출 가위바위보' 실시간 상태.
//
// ── 다른 게임과 다른 점 ────────────────────────────────────────────────────
// 이 게임은 참가자 폰을 쓰지 않는다. 아이패드 한 대 앞에 한 줄로 서서 한 명씩
// 나와 손을 내밀고, 손 모양 인식은 그 아이패드 안에서 끝난다. 그래서
//  - 누가 하는 차례인지는 **진행자가 명단에서 지목**한다 (운영 결정)
//  - 인식 결과('rock'|'paper'|'scissors')는 아이패드가 보내지만,
//    맞았는지는 **서버가 다시 판단한다**. 영상은 서버로 오지 않는다.
//
// 한 차례의 흐름은 서버 타이머가 끌고 간다. 아이패드가 시간을 재게 하면
// 기기 성능에 따라 제한시간이 달라져 공정하지 않다.
//
//   ready(카메라 앞에 서기) → reveal(캐릭터가 손을 냄) → answer(지시 + 받기)
//   → [gap → reveal → answer] (난이도 '상'은 두 번) → 결과

const games = new Map(); // eventCode -> LateRpsGameState
const timers = new Map(); // eventCode -> timeout handle

function clearPhaseTimer(code) {
  const t = timers.get(code);
  if (t) {
    clearTimeout(t);
    timers.delete(code);
  }
}

function createInitialState() {
  return {
    status: 'idle', // idle | ready | playing | result | ended
    difficultyId: 'normal',
    currentId: null, // 지금 호출된 참가자
    turn: null, // { beats, index, phase, phaseEndsAt, answeredAt }
    lastResult: null, // 방금 끝난 사람의 결과
    history: [], // 지나간 차례들 (기록 저장용)
    earned: new Map(), // participantId -> 이 게임에서 받은 점수
    doneIds: [], // 이미 한 번 한 사람 (진행자가 명단에서 구분할 수 있게)
  };
}

function getState(eventCode) {
  const code = normalizeEventCode(eventCode);
  let s = games.get(code);
  if (!s) {
    s = createInitialState();
    games.set(code, s);
  }
  return s;
}

function nicknameOf(id) {
  return id == null ? null : getParticipantById(id)?.nickname ?? '알 수 없음';
}

/**
 * 공개 상태.
 *
 * 캐릭터가 낼 손과 지시는 **그 순간이 되기 전에는 내보내지 않는다**. 미리 보내면
 * 화면이 숨기고 있어도 개발자 도구로 들여다볼 수 있고, 그러면 게임이 성립하지 않는다.
 */
function publicState(state) {
  const turn = state.turn;
  const beat = turn ? turn.beats[turn.index] : null;
  const revealed = turn && (turn.phase === 'reveal' || turn.phase === 'answer');

  return {
    status: state.status,
    difficultyId: state.difficultyId,
    currentId: state.currentId,
    currentNickname: nicknameOf(state.currentId),
    doneIds: state.doneIds,
    turn: turn
      ? {
          phase: turn.phase, // ready | reveal | answer
          index: turn.index,
          total: turn.beats.length,
          phaseEndsAt: turn.phaseEndsAt,
          // 캐릭터 손은 reveal 부터, 지시는 answer 부터만 보인다
          hand: revealed ? beat.hand : null,
          instruction: turn.phase === 'answer' ? beat.instruction : null,
          answered: beat.answered ?? null,
        }
      : null,
    lastResult: state.lastResult,
    playedCount: state.history.length,
    ranking:
      state.status === 'ended'
        ? [...state.earned.entries()]
            .map(([participantId, points]) => ({ participantId, nickname: nicknameOf(participantId), points }))
            .sort((a, b) => b.points - a.points)
        : null,
  };
}

function broadcast(io, code) {
  io.to(eventRoom(code)).emit('laterps:state', publicState(getState(code)));
}

export function getLaterpsSnapshot(eventCode) {
  return publicState(getState(eventCode));
}

/** 아이패드(스크린)나 진행자 노트북이 인식 결과를 보낼 수 있다. */
function canSubmitGesture(socket, code) {
  if (isAuthorizedOperator(socket, code)) return true;
  return socket.data.role === 'screen' && socket.data.eventCode === normalizeEventCode(code);
}

/** 이번 비트를 닫고 다음 단계로 넘어간다. */
function finishBeat(io, code) {
  const state = getState(code);
  const turn = state.turn;
  if (!turn) return;

  const beat = turn.beats[turn.index];
  // 시간 안에 아무것도 안 냈으면 '무응답' — 틀린 것과 같게 두되 기록은 구분한다
  if (beat.answered == null) {
    beat.answered = null;
    beat.correct = false;
    beat.elapsedMs = null;
    beat.points = 0;
  }

  if (turn.index + 1 < turn.beats.length) {
    turn.index += 1;
    setPhase(io, code, 'gap', BEAT_GAP_MS);
    return;
  }
  finishTurn(io, code);
}

function finishTurn(io, code) {
  const state = getState(code);
  const turn = state.turn;
  if (!turn) return;
  clearPhaseTimer(code);

  const points = turn.beats.reduce((sum, b) => sum + (b.points ?? 0), 0);
  const result = {
    participantId: state.currentId,
    nickname: nicknameOf(state.currentId),
    beats: turn.beats.map((b) => ({
      hand: b.hand,
      instruction: b.instruction,
      answered: b.answered,
      correct: b.correct,
      elapsedMs: b.elapsedMs,
      points: b.points ?? 0,
    })),
    points,
  };

  state.lastResult = result;
  state.history.push(result);
  if (state.currentId != null) {
    if (!state.doneIds.includes(state.currentId)) state.doneIds = [...state.doneIds, state.currentId];
    if (points > 0) {
      addScore(state.currentId, points);
      state.earned.set(state.currentId, (state.earned.get(state.currentId) ?? 0) + points);
    }
  }

  state.turn = null;
  state.status = 'result';

  const event = getEventByCode(code);
  if (event && points > 0) broadcastScoreboard(io, code, event.id);
  broadcast(io, code);
}

/** 단계를 바꾸고, 그 단계가 끝날 시각에 다음 단계를 예약한다. */
function setPhase(io, code, phase, durationMs) {
  const state = getState(code);
  const turn = state.turn;
  if (!turn) return;

  clearPhaseTimer(code);
  turn.phase = phase;
  turn.phaseEndsAt = Date.now() + durationMs;

  const next = () => {
    timers.delete(code);
    const s = getState(code);
    if (!s.turn || s.status !== 'playing') return; // 그 사이에 리셋됐다면 아무것도 안 한다
    if (phase === 'ready' || phase === 'gap') {
      setPhase(io, code, 'reveal', REVEAL_GAP_MS);
    } else if (phase === 'reveal') {
      const d = difficultyById(s.difficultyId);
      s.turn.beats[s.turn.index].startedAt = Date.now();
      setPhase(io, code, 'answer', d.answerMs);
    } else if (phase === 'answer') {
      finishBeat(io, code);
    }
  };

  timers.set(code, setTimeout(next, durationMs));
  broadcast(io, code);
}

export function registerLaterpsHandlers(io, socket) {
  /** 진행자가 패널을 펼치면 아이패드 화면이 이 게임으로 바뀐다. */
  socket.on('laterps:setup', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'idle' && state.status !== 'ready') return reply({ ok: true });

    const d = difficultyById(String(payload.difficultyId ?? state.difficultyId));
    if (!d) return reply({ ok: false, error: 'INVALID_DIFFICULTY' });

    state.status = 'ready';
    state.difficultyId = d.id;
    reply({ ok: true });
    broadcast(io, code);
  });

  /** 다른 게임으로 넘어가면 아이패드 화면도 치운다 (카메라도 꺼진다). */
  socket.on('laterps:leave', (payload = {}, ack) => {
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

  /** 다음 차례를 호출한다 (진행자가 명단에서 지목 — 운영 결정). */
  socket.on('laterps:call', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status === 'playing') return reply({ ok: false, error: 'TURN_IN_PROGRESS' });

    const id = Number(payload.participantId);
    const event = getEventByCode(code);
    if (!event) return reply({ ok: false, error: 'EVENT_NOT_FOUND' });
    const ok = listParticipantsByEvent(event.id).some((p) => p.id === id && p.status === 'active');
    if (!ok) return reply({ ok: false, error: 'NOT_A_PARTICIPANT' });

    state.currentId = id;
    state.status = 'ready';
    state.lastResult = null;
    reply({ ok: true });
    broadcast(io, code);
  });

  /** 호출된 사람의 차례를 시작한다. */
  socket.on('laterps:start', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status === 'playing') return reply({ ok: false, error: 'TURN_IN_PROGRESS' });
    if (state.currentId == null) return reply({ ok: false, error: 'NOBODY_CALLED' });

    const d = difficultyById(state.difficultyId);
    state.turn = { beats: rollTurn(d), index: 0, phase: 'ready', phaseEndsAt: null };
    state.status = 'playing';
    state.lastResult = null;

    reply({ ok: true });
    setPhase(io, code, 'ready', READY_MS);
  });

  /**
   * 아이패드가 인식한 손 모양.
   * 맞았는지는 여기서 계산한다 — 아이패드가 보낸 판정은 받지 않는다.
   */
  socket.on('laterps:gesture', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!canSubmitGesture(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    const turn = state.turn;
    if (state.status !== 'playing' || !turn) return reply({ ok: false, error: 'NOT_PLAYING' });
    // 지시가 뜨기 전에 낸 손은 받지 않는다. 이 뜸을 못 참는 게 함정이라,
    // 미리 낸 걸 인정해버리면 게임이 성립하지 않는다.
    if (turn.phase !== 'answer') return reply({ ok: false, error: 'TOO_EARLY' });

    const beat = turn.beats[turn.index];
    if (beat.answered != null) return reply({ ok: false, error: 'ALREADY_ANSWERED' });

    const hand = String(payload.hand ?? '');
    if (!HANDS.includes(hand)) return reply({ ok: false, error: 'INVALID_HAND' });

    const d = difficultyById(state.difficultyId);
    const elapsed = Math.max(0, Date.now() - (beat.startedAt ?? Date.now()));
    beat.answered = hand;
    beat.correct = isCorrect(beat.hand, beat.instruction, hand);
    beat.elapsedMs = elapsed;
    beat.points = pointsFor(beat.correct, elapsed, d.answerMs);

    reply({ ok: true, correct: beat.correct, points: beat.points });
    // 답이 나오면 남은 시간을 기다리지 않고 바로 넘어간다
    finishBeat(io, code);
  });

  /** 지금 차례를 그만두기 (손을 못 내거나 자리를 비웠을 때). */
  socket.on('laterps:skip', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status !== 'playing' || !state.turn) return reply({ ok: false, error: 'NOT_PLAYING' });
    // 남은 비트는 무응답으로 닫는다
    for (let i = state.turn.index; i < state.turn.beats.length; i += 1) {
      const b = state.turn.beats[i];
      if (b.answered == null) {
        b.answered = null;
        b.correct = false;
        b.elapsedMs = null;
        b.points = 0;
      }
    }
    finishTurn(io, code);
    reply({ ok: true });
  });

  /** 결과를 확인하고 다음 사람을 받을 준비로 돌아간다. */
  socket.on('laterps:next', (payload = {}, ack) => {
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

  socket.on('laterps:end', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getState(code);
    if (state.status === 'idle' || state.status === 'ended') {
      return reply({ ok: false, error: 'NOT_RUNNING' });
    }
    clearPhaseTimer(code);
    state.turn = null;

    const event = getEventByCode(code);
    if (event) {
      createGameRecord({
        eventId: event.id,
        gameType: 'laterps',
        result: {
          difficultyId: state.difficultyId,
          played: state.history.length,
          turns: state.history.map((h) => ({
            nickname: h.nickname,
            points: h.points,
            beats: h.beats.map((b) => ({ hand: b.hand, instruction: b.instruction, answered: b.answered, correct: b.correct })),
          })),
          totals: [...state.earned.entries()]
            .map(([participantId, points]) => ({ participantId, nickname: nicknameOf(participantId), points }))
            .sort((a, b) => b.points - a.points),
        },
      });
    }

    state.status = 'ended';
    reply({ ok: true });
    broadcast(io, code);
  });

  socket.on('laterps:reset', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    clearPhaseTimer(code);
    games.set(code, createInitialState());
    reply({ ok: true });
    broadcast(io, code);
  });
}
