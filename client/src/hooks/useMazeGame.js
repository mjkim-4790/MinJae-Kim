import { useCallback, useEffect, useRef, useState } from 'react';

import { socket } from '../lib/socket.js';

const IDLE_STATE = {
  status: 'idle',
  control: null,
  limitMs: 0,
  maze: null,
  startsAt: null,
  endsAt: null,
  serverNow: null,
  activeParticipantIds: [],
  finishedParticipantIds: [],
  ranking: null,
};

/**
 * '미로 찾기' 실시간 상태.
 *
 * 시각 보정: 폰 시계는 서버와 몇 초씩 어긋나 있을 수 있다. 그대로 startsAt 을 믿으면
 * 누구는 먼저 출발하고 누구는 늦게 출발한다. 그래서 서버가 같이 보내주는 serverNow 로
 * 오차를 재서, 남은 시간을 물어볼 때마다 보정한다.
 */
export function useMazeGame({ eventCode, initialState, initialYourFinish }) {
  const [state, setState] = useState(initialState ?? IDLE_STATE);
  const [myFinishMs, setMyFinishMs] = useState(initialYourFinish ?? null);
  const [dismissed, setDismissed] = useState(false);
  const offsetRef = useRef(0); // 서버시각 - 내시각

  const applyState = useCallback((next) => {
    if (next?.serverNow) offsetRef.current = next.serverNow - Date.now();
    setState(next);
  }, []);

  useEffect(() => {
    if (initialState) applyState(initialState);
  }, [initialState, applyState]);

  useEffect(() => {
    if (initialYourFinish !== undefined) setMyFinishMs(initialYourFinish);
  }, [initialYourFinish]);

  useEffect(() => {
    socket.on('maze:state', applyState);
    return () => socket.off('maze:state', applyState);
  }, [applyState]);

  useEffect(() => {
    if (state.status !== 'ended') setDismissed(false);
    // 새 경기가 시작되면 지난 기록은 지운다
    if (state.status === 'countdown') setMyFinishMs(null);
  }, [state.status]);

  /** 서버 시계 기준 현재 시각 */
  const serverTime = useCallback(() => Date.now() + offsetRef.current, []);

  const finish = useCallback(
    () =>
      new Promise((resolve) =>
        socket.emit('maze:finish', { eventCode }, (res) => {
          if (res?.ok) setMyFinishMs(res.elapsedMs);
          resolve(res);
        }),
      ),
    [eventCode],
  );

  const start = useCallback(
    ({ control, limitSec }) =>
      new Promise((resolve) => socket.emit('maze:start', { eventCode, control, limitSec }, resolve)),
    [eventCode],
  );
  const reveal = useCallback(
    () => new Promise((resolve) => socket.emit('maze:reveal', { eventCode }, resolve)),
    [eventCode],
  );
  const end = useCallback(
    () => new Promise((resolve) => socket.emit('maze:end', { eventCode }, resolve)),
    [eventCode],
  );
  const reset = useCallback(
    () => new Promise((resolve) => socket.emit('maze:reset', { eventCode }, resolve)),
    [eventCode],
  );
  const dismiss = useCallback(() => setDismissed(true), []);

  return { state, myFinishMs, dismissed, serverTime, finish, start, reveal, end, reset, dismiss };
}
