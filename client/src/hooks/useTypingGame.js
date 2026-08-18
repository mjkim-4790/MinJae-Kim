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
  // 참여자가 스스로 "확인"을 눌러 종료 화면을 닫고 원래 화면(점수/채팅/순위)으로
  // 돌아가기 위한 로컬 상태 — 서버 상태(status)와 별개로, 운영자가 리셋하기 전에도
  // 각자 알아서 넘어갈 수 있게 한다. 새 라운드가 시작되면(= status 가 ended 를
  // 벗어나면) 다음 종료 화면을 다시 볼 수 있도록 초기화한다.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (initialState) setState(initialState);
  }, [initialState]);

  useEffect(() => {
    const onState = (next) => setState(next);
    socket.on('typing:state', onState);
    return () => socket.off('typing:state', onState);
  }, []);

  useEffect(() => {
    if (state.status !== 'ended') setDismissed(false);
  }, [state.status]);

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
  const dismiss = useCallback(() => setDismissed(true), []);

  return { state, dismissed, start, submit, lock, reveal, advance, reset, dismiss };
}
