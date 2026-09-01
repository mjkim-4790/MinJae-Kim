import { useCallback, useEffect, useRef, useState } from 'react';

import { socket } from '../lib/socket.js';

const IDLE_STATE = {
  status: 'idle',
  round: 0,
  chairCount: 0,
  players: [],
  eliminatedIds: [],
  spinStartedAt: null,
  spinDegPerSec: 60,
  freezeAngle: null,
  grabEndsAt: null,
  serverNow: null,
  taken: [],
  result: null,
};

/**
 * '의자 빨리 뺏기' 실시간 상태.
 *
 * 시각 보정은 미로와 같은 이유로 필요하다 — 폰 시계가 서버와 어긋나 있으면
 * 원이 도는 위치와 남은 시간이 기기마다 달라진다.
 */
export function useChairsGame({ eventCode, initialState, initialYourSeat }) {
  const [state, setState] = useState(initialState ?? IDLE_STATE);
  const [mySeat, setMySeat] = useState(initialYourSeat ?? null);
  const [dismissed, setDismissed] = useState(false);
  const offsetRef = useRef(0);

  const applyState = useCallback((next) => {
    if (next?.serverNow) offsetRef.current = next.serverNow - Date.now();
    setState(next);
  }, []);

  useEffect(() => {
    if (initialState) applyState(initialState);
  }, [initialState, applyState]);

  useEffect(() => {
    if (initialYourSeat !== undefined) setMySeat(initialYourSeat);
  }, [initialYourSeat]);

  useEffect(() => {
    socket.on('chairs:state', applyState);
    return () => socket.off('chairs:state', applyState);
  }, [applyState]);

  useEffect(() => {
    if (state.status !== 'ended') setDismissed(false);
    // 새 라운드가 시작되면 지난 라운드에 앉은 자리는 지운다
    if (state.status === 'spinning' || state.status === 'idle') setMySeat(null);
  }, [state.status, state.round]);

  const serverTime = useCallback(() => Date.now() + offsetRef.current, []);

  const sit = useCallback(
    (chairIndex) =>
      new Promise((resolve) =>
        socket.emit('chairs:sit', { eventCode, chairIndex }, (res) => {
          if (res?.ok) setMySeat(res.chairIndex);
          resolve(res);
        }),
      ),
    [eventCode],
  );

  // 옵션은 통째로 넘긴다 (항목이 늘 때 빠뜨리지 않도록 — 미로에서 겪은 문제)
  const start = useCallback(
    (options = {}) =>
      new Promise((resolve) => socket.emit('chairs:start', { eventCode, ...options }, resolve)),
    [eventCode],
  );
  const advance = useCallback(
    () => new Promise((resolve) => socket.emit('chairs:advance', { eventCode }, resolve)),
    [eventCode],
  );
  const reset = useCallback(
    () => new Promise((resolve) => socket.emit('chairs:reset', { eventCode }, resolve)),
    [eventCode],
  );
  const dismiss = useCallback(() => setDismissed(true), []);

  return { state, mySeat, dismissed, serverTime, sit, start, advance, reset, dismiss };
}
