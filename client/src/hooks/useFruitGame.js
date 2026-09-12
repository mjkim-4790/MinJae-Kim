import { useCallback, useEffect, useState } from 'react';

import { socket } from '../lib/socket.js';

const IDLE_STATE = {
  status: 'idle',
  currentId: null,
  currentNickname: null,
  doneIds: [],
  doneCount: 0,
  songName: null,
  bpm: null,
  hasChart: false,
  chartLength: 0,
  lastResult: null,
  ranking: null,
  chart: undefined, // 아이패드(스크린)에서만 채워진다
};

/**
 * '리듬 과일 자르기' 실시간 상태.
 *
 * 서버는 두 갈래로 방송한다 — 참가자·진행자는 차트 없는 가벼운 상태를, 아이패드만
 * 차트가 든 상태를 받는다. 얕게 병합하는 이유는 옷 입어보기와 같다: 아이패드는 둘
 * 다 받는데, 차트 없는 쪽이 나중에 와도 chart 키가 아예 없으므로 방금 받은 차트를
 * 지우지 않는다.
 */
export function useFruitGame({ eventCode, initialState }) {
  const [state, setState] = useState(initialState ?? IDLE_STATE);
  const [live, setLive] = useState(null); // { score, combo, maxCombo, sliced, total, bombs }
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (initialState) setState(initialState);
  }, [initialState]);

  useEffect(() => {
    const onState = (next) => setState((prev) => ({ ...prev, ...next }));
    const onLive = (next) => setLive(next);
    socket.on('fruit:state', onState);
    socket.on('fruit:live', onLive);
    return () => {
      socket.off('fruit:state', onState);
      socket.off('fruit:live', onLive);
    };
  }, []);

  useEffect(() => {
    if (state.status !== 'ended') setDismissed(false);
    // 새 판이 시작되면 지난 점수는 지운다
    if (state.status === 'playing' || state.status === 'ready') setLive(null);
  }, [state.status]);

  const call = useCallback(
    (event, payload = {}) =>
      new Promise((resolve) => socket.emit(event, { eventCode, ...payload }, resolve)),
    [eventCode],
  );

  const setup = useCallback(() => call('fruit:setup'), [call]);
  const leave = useCallback(() => call('fruit:leave'), [call]);
  const sendChart = useCallback((payload) => call('fruit:chart', payload), [call]);
  const callPlayer = useCallback((participantId) => call('fruit:call', { participantId }), [call]);
  const start = useCallback(() => call('fruit:start'), [call]);
  const sendHit = useCallback((i, dtMs) => call('fruit:hit', { i, dtMs }), [call]);
  const finish = useCallback(() => call('fruit:finish'), [call]);
  const next = useCallback(() => call('fruit:next'), [call]);
  const end = useCallback(() => call('fruit:end'), [call]);
  const reset = useCallback(() => call('fruit:reset'), [call]);
  const dismiss = useCallback(() => setDismissed(true), []);

  return { state, live, dismissed, setup, leave, sendChart, callPlayer, start, sendHit, finish, next, end, reset, dismiss };
}
