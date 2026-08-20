import { useCallback, useEffect, useState } from 'react';

import { socket } from '../lib/socket.js';

const IDLE_STATE = {
  status: 'idle',
  activeParticipantIds: [],
  submittedParticipantIds: [],
  finishers: [],
};

/**
 * '나의 가치여정' 실시간 상태 (useAcrosticGame.js 와 같은 구조). 다른 게임과 달리
 * 공유 제시어·투표가 없는 완전히 개인적인 활동이라, 내 단어 목록·취소선 상태(yours)는
 * 방 전체 브로드캐스트(state)가 아니라 submit/cross 액션의 ack 응답으로만 받는다 —
 * 재접속 시에는 session:hello/player:join 응답의 초기 스냅샷(initialYours)으로 복원한다.
 *
 * @param {{ eventCode: string, initialState?: object, initialYours?: object|null }} args
 */
export function useValuesGame({ eventCode, initialState, initialYours }) {
  const [state, setState] = useState(initialState ?? IDLE_STATE);
  const [yours, setYours] = useState(initialYours ?? null);
  // 참여자가 스스로 "확인"을 눌러 종료 화면을 닫고 원래 화면으로 돌아가기 위한 로컬
  // 상태 (useTypingGame.js/useAcrosticGame.js 와 동일한 이유).
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (initialState) setState(initialState);
  }, [initialState]);

  useEffect(() => {
    if (initialYours !== undefined) setYours(initialYours);
  }, [initialYours]);

  useEffect(() => {
    const onState = (next) => setState(next);
    socket.on('values:state', onState);
    return () => socket.off('values:state', onState);
  }, []);

  useEffect(() => {
    if (state.status !== 'ended') setDismissed(false);
    if (state.status === 'idle') setYours(null);
  }, [state.status]);

  const start = useCallback(
    () => new Promise((resolve) => socket.emit('values:start', { eventCode }, resolve)),
    [eventCode],
  );
  const submit = useCallback(
    (words) =>
      new Promise((resolve) =>
        socket.emit('values:submit', { eventCode, words }, (res) => {
          if (res?.ok) setYours({ words: res.words, crossedIndices: res.crossedIndices, done: res.done, finalWord: res.finalWord });
          resolve(res);
        }),
      ),
    [eventCode],
  );
  const cross = useCallback(
    (index) =>
      new Promise((resolve) =>
        socket.emit('values:cross', { eventCode, index }, (res) => {
          if (res?.ok) {
            setYours((cur) => ({
              ...cur,
              crossedIndices: res.crossedIndices,
              done: res.done,
              finalWord: res.finalWord,
            }));
          }
          resolve(res);
        }),
      ),
    [eventCode],
  );
  const lock = useCallback(
    () => new Promise((resolve) => socket.emit('values:lock', { eventCode }, resolve)),
    [eventCode],
  );
  const reset = useCallback(
    () => new Promise((resolve) => socket.emit('values:reset', { eventCode }, resolve)),
    [eventCode],
  );
  const dismiss = useCallback(() => setDismissed(true), []);

  return { state, yours, dismissed, start, submit, cross, lock, reset, dismiss };
}
