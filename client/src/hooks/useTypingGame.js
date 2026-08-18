import { useCallback, useEffect, useState } from 'react';

import { socket } from '../lib/socket.js';

const IDLE_STATE = {
  status: 'idle',
  difficulty: null,
  sentence: null,
  activeParticipantIds: [],
  submittedParticipantIds: [],
  startedAt: null,
  ranking: null,
  unsubmitted: null,
};

/**
 * '메시지 빨리 보내기' 실시간 상태 (useLiarGame.js 와 같은 구조). session:hello/player:join
 * 응답의 초기 스냅샷으로 시작하고, 이후 typing:state 브로드캐스트로 계속 동기화한다.
 * 제시 문장은 라이어의 단어와 달리 비밀이 아니라서 liar.js 처럼 개별 수신할 필요가 없다 —
 * publicState 에 항상 실려 온다.
 *
 * @param {{ eventCode: string, initialState?: object }} args
 */
export function useTypingGame({ eventCode, initialState }) {
  const [state, setState] = useState(initialState ?? IDLE_STATE);

  useEffect(() => {
    if (initialState) setState(initialState);
  }, [initialState]);

  useEffect(() => {
    const onState = (next) => setState(next);
    socket.on('typing:state', onState);
    return () => socket.off('typing:state', onState);
  }, []);

  const start = useCallback(
    (payload) => new Promise((resolve) => socket.emit('typing:start', { eventCode, ...payload }, resolve)),
    [eventCode],
  );
  const submit = useCallback(
    (text) => new Promise((resolve) => socket.emit('typing:submit', { eventCode, text }, resolve)),
    [eventCode],
  );
  const lock = useCallback(
    () => new Promise((resolve) => socket.emit('typing:lock', { eventCode }, resolve)),
    [eventCode],
  );
  const reveal = useCallback(
    () => new Promise((resolve) => socket.emit('typing:reveal', { eventCode }, resolve)),
    [eventCode],
  );
  const advance = useCallback(
    () => new Promise((resolve) => socket.emit('typing:advance', { eventCode }, resolve)),
    [eventCode],
  );
  const reset = useCallback(
    () => new Promise((resolve) => socket.emit('typing:reset', { eventCode }, resolve)),
    [eventCode],
  );

  return { state, start, submit, lock, reveal, advance, reset };
}
