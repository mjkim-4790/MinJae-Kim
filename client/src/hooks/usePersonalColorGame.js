import { useCallback, useEffect, useState } from 'react';

import { socket } from '../lib/socket.js';

const IDLE_STATE = {
  status: 'idle',
  currentId: null,
  currentNickname: null,
  doneIds: [],
  step: 0,
  total: 5,
  drape: null,
  answers: {},
  lastResult: null,
  doneCount: 0,
  tally: [],
};

/** '퍼스널컬러 찾아보기' 실시간 상태. 판정은 전부 서버가 한다. */
export function usePersonalColorGame({ eventCode, initialState }) {
  const [state, setState] = useState(initialState ?? IDLE_STATE);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (initialState) setState(initialState);
  }, [initialState]);

  useEffect(() => {
    const onState = (next) => setState(next);
    socket.on('personalcolor:state', onState);
    return () => socket.off('personalcolor:state', onState);
  }, []);

  useEffect(() => {
    if (state.status !== 'ended') setDismissed(false);
  }, [state.status]);

  const call = useCallback(
    (event, payload = {}) =>
      new Promise((resolve) => socket.emit(event, { eventCode, ...payload }, resolve)),
    [eventCode],
  );

  const setup = useCallback(() => call('personalcolor:setup'), [call]);
  const leave = useCallback(() => call('personalcolor:leave'), [call]);
  const callPlayer = useCallback((participantId) => call('personalcolor:call', { participantId }), [call]);
  const start = useCallback(() => call('personalcolor:start'), [call]);
  const sendSkin = useCallback((hex) => call('personalcolor:skin', { hex }), [call]);
  const answer = useCallback((choice) => call('personalcolor:answer', { choice }), [call]);
  const skip = useCallback(() => call('personalcolor:skip'), [call]);
  const next = useCallback(() => call('personalcolor:next'), [call]);
  const end = useCallback(() => call('personalcolor:end'), [call]);
  const reset = useCallback(() => call('personalcolor:reset'), [call]);
  const dismiss = useCallback(() => setDismissed(true), []);

  return { state, dismissed, setup, leave, callPlayer, start, sendSkin, answer, skip, next, end, reset, dismiss };
}
