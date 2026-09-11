import { useCallback, useEffect, useState } from 'react';

import { socket } from '../lib/socket.js';

const IDLE_STATE = {
  status: 'idle',
  threshold: 0.78,
  currentId: null,
  currentNickname: null,
  doneIds: [],
  phase: null,
  phaseEndsAt: null,
  pose: null,
  live: { match: 0, best: 0, holding: false },
  lastResult: null,
  playedCount: 0,
  poseList: [],
  ranking: null,
};

/** '실루엣 통과' 실시간 상태. 한 판의 진행과 채점은 전부 서버가 한다. */
export function useSilhouetteGame({ eventCode, initialState }) {
  const [state, setState] = useState(initialState ?? IDLE_STATE);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (initialState) setState(initialState);
  }, [initialState]);

  useEffect(() => {
    const onState = (next) => setState(next);
    socket.on('silhouette:state', onState);
    return () => socket.off('silhouette:state', onState);
  }, []);

  useEffect(() => {
    if (state.status !== 'ended') setDismissed(false);
  }, [state.status]);

  const call = useCallback(
    (event, payload = {}) =>
      new Promise((resolve) => socket.emit(event, { eventCode, ...payload }, resolve)),
    [eventCode],
  );

  const setup = useCallback(() => call('silhouette:setup'), [call]);
  const leave = useCallback(() => call('silhouette:leave'), [call]);
  const callPlayer = useCallback((participantId) => call('silhouette:call', { participantId }), [call]);
  // options 를 통째로 펼쳐 넘긴다 (필드를 나열하면 옵션이 조용히 사라진다)
  const start = useCallback((options = {}) => call('silhouette:start', options), [call]);
  const sendAngles = useCallback((angles) => call('silhouette:angles', { angles }), [call]);
  const skip = useCallback(() => call('silhouette:skip'), [call]);
  const next = useCallback(() => call('silhouette:next'), [call]);
  const end = useCallback(() => call('silhouette:end'), [call]);
  const reset = useCallback(() => call('silhouette:reset'), [call]);
  const dismiss = useCallback(() => setDismissed(true), []);

  return { state, dismissed, setup, leave, callPlayer, start, sendAngles, skip, next, end, reset, dismiss };
}
