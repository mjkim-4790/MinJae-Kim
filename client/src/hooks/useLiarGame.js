import { useCallback, useEffect, useState } from 'react';

import { socket } from '../lib/socket.js';

const IDLE_STATE = {
  status: 'idle',
  category: null,
  activeParticipantIds: [],
  turnOrder: [],
  currentTurnParticipantId: null,
  votedParticipantIds: [],
  result: null,
};

/**
 * 라이어 게임 실시간 상태 (useRpsGame.js 와 같은 구조). session:hello/player:join
 * 응답의 초기 스냅샷으로 시작하고, 이후 liar:state 브로드캐스트로 계속 동기화한다.
 * 내 단어(yourWord)는 절대 방 전체로 브로드캐스트되지 않고 liar:yourWord 로 개별
 * 수신한다 — 게임 시작 시 한 번, 재접속 시에는 초기 스냅샷(initialYourWord)으로 받는다.
 *
 * @param {{ eventCode: string, participantId?: number|null, initialState?: object, initialYourWord?: object|null }} args
 */
export function useLiarGame({ eventCode, participantId = null, initialState, initialYourWord }) {
  const [state, setState] = useState(initialState ?? IDLE_STATE);
  const [yourWord, setYourWord] = useState(initialYourWord ?? null);

  useEffect(() => {
    if (initialState) setState(initialState);
  }, [initialState]);

  useEffect(() => {
    setYourWord(initialYourWord ?? null);
  }, [initialYourWord]);

  useEffect(() => {
    const onState = (next) => {
      setState(next);
      if (next.status === 'idle') setYourWord(null);
    };
    const onYourWord = (payload) => {
      if (participantId) setYourWord(payload);
    };
    socket.on('liar:state', onState);
    socket.on('liar:yourWord', onYourWord);
    return () => {
      socket.off('liar:state', onState);
      socket.off('liar:yourWord', onYourWord);
    };
  }, [participantId]);

  const start = useCallback(
    (payload) => new Promise((resolve) => socket.emit('liar:start', { eventCode, ...payload }, resolve)),
    [eventCode],
  );
  const next = useCallback(
    () => new Promise((resolve) => socket.emit('liar:next', { eventCode }, resolve)),
    [eventCode],
  );
  const stop = useCallback(
    () => new Promise((resolve) => socket.emit('liar:stop', { eventCode }, resolve)),
    [eventCode],
  );
  const vote = useCallback(
    (accusedId) => new Promise((resolve) => socket.emit('liar:vote', { eventCode, accusedId }, resolve)),
    [eventCode],
  );
  const lock = useCallback(
    () => new Promise((resolve) => socket.emit('liar:lock', { eventCode }, resolve)),
    [eventCode],
  );
  const advance = useCallback(
    () => new Promise((resolve) => socket.emit('liar:advance', { eventCode }, resolve)),
    [eventCode],
  );
  const reset = useCallback(
    () => new Promise((resolve) => socket.emit('liar:reset', { eventCode }, resolve)),
    [eventCode],
  );

  return { state, yourWord, start, next, stop, vote, lock, advance, reset };
}
