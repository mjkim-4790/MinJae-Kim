import { useCallback, useEffect, useRef, useState } from 'react';

import { socket } from '../lib/socket.js';
import { POSITION_SEND_MS } from '../lib/maze.js';

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
  // 대형화면만 쓰는 값 — 참여자 폰에는 이 이벤트가 오지 않는다
  const [livePositions, setLivePositions] = useState(null);
  const offsetRef = useRef(0); // 서버시각 - 내시각
  const lastSentRef = useRef(0);

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
    const onPositions = (payload) => setLivePositions(payload);
    socket.on('maze:positions', onPositions);
    return () => socket.off('maze:positions', onPositions);
  }, []);

  useEffect(() => {
    if (state.status !== 'ended') setDismissed(false);
    // 새 경기가 시작되면 지난 기록은 지운다
    if (state.status === 'countdown') {
      setMyFinishMs(null);
      setLivePositions(null);
    }
  }, [state.status]);

  /**
   * 내 공 위치를 알린다 (대형화면 중계용).
   * 게임 루프가 매 프레임 부르므로 여기서 간격을 지켜 걸러낸다 — 60fps 그대로
   * 쏘면 서버가 감당하지 못한다. ack 는 받지 않는다(왕복 자체가 부담).
   */
  const sendPosition = useCallback(
    (x, y) => {
      const now = Date.now();
      if (now - lastSentRef.current < POSITION_SEND_MS) return;
      lastSentRef.current = now;
      socket.emit('maze:pos', { eventCode, x, y });
    },
    [eventCode],
  );

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

  // 옵션을 하나씩 골라 담지 않고 통째로 넘긴다. 예전에 여기서 difficulty 를 빠뜨려
  // 운영자가 난이도를 골라도 서버에는 안 가는 버그가 있었다 — 항목을 추가할 때마다
  // 이 줄을 같이 고쳐야 하는 구조 자체가 문제였다.
  const start = useCallback(
    (options = {}) =>
      new Promise((resolve) => socket.emit('maze:start', { eventCode, ...options }, resolve)),
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

  return {
    state,
    myFinishMs,
    dismissed,
    livePositions,
    serverTime,
    sendPosition,
    finish,
    start,
    reveal,
    end,
    reset,
    dismiss,
  };
}
