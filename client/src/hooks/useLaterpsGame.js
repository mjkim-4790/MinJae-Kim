import { useCallback, useEffect, useState } from 'react';

import { socket } from '../lib/socket.js';

const IDLE_STATE = {
  status: 'idle',
  difficultyId: 'normal',
  currentId: null,
  currentNickname: null,
  doneIds: [],
  turn: null,
  lastResult: null,
  playedCount: 0,
  ranking: null,
};

/**
 * '후출 가위바위보' 실시간 상태.
 *
 * 한 차례의 진행(캐릭터가 손을 내고, 지시가 뜨고, 시간이 끝나는 것)은 전부 서버가
 * 끌고 간다. 아이패드는 보여주고, 손을 읽어 보내는 일만 한다.
 */
export function useLaterpsGame({ eventCode, initialState }) {
  const [state, setState] = useState(initialState ?? IDLE_STATE);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (initialState) setState(initialState);
  }, [initialState]);

  useEffect(() => {
    const onState = (next) => setState(next);
    socket.on('laterps:state', onState);
    return () => socket.off('laterps:state', onState);
  }, []);

  useEffect(() => {
    if (state.status !== 'ended') setDismissed(false);
  }, [state.status]);

  const call = useCallback(
    (event, payload = {}) =>
      new Promise((resolve) => socket.emit(event, { eventCode, ...payload }, resolve)),
    [eventCode],
  );

  // options 를 통째로 펼쳐 넘긴다 (필드를 나열하면 나중에 옵션이 조용히 사라진다)
  const setup = useCallback((options = {}) => call('laterps:setup', options), [call]);
  const leave = useCallback(() => call('laterps:leave'), [call]);
  const callPlayer = useCallback((participantId) => call('laterps:call', { participantId }), [call]);
  const start = useCallback(() => call('laterps:start'), [call]);
  const sendGesture = useCallback((hand) => call('laterps:gesture', { hand }), [call]);
  const skip = useCallback(() => call('laterps:skip'), [call]);
  const next = useCallback(() => call('laterps:next'), [call]);
  const end = useCallback(() => call('laterps:end'), [call]);
  const reset = useCallback(() => call('laterps:reset'), [call]);
  const dismiss = useCallback(() => setDismissed(true), []);

  return { state, dismissed, setup, leave, callPlayer, start, sendGesture, skip, next, end, reset, dismiss };
}
