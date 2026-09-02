import { useCallback, useEffect, useRef, useState } from 'react';

import { socket } from '../lib/socket.js';
import { POSITION_SEND_MS } from '../lib/mugunghwa.js';

const IDLE_STATE = {
  status: 'idle',
  round: 0,
  strictness: 'normal',
  doll: null,
  dollId: null,
  green: true,
  lightChangedAt: null,
  sprintEndsAt: null,
  serverNow: null,
  runners: [],
  eliminatedIds: [],
  readyIds: [],
  toucher: null,
  result: null,
};

export function useMugunghwaGame({ eventCode, initialState, initialYourPos }) {
  const [state, setState] = useState(initialState ?? IDLE_STATE);
  const [myPos, setMyPos] = useState(initialYourPos ?? 0);
  const [dismissed, setDismissed] = useState(false);
  const [livePositions, setLivePositions] = useState(null); // 대형화면만 받는다
  const offsetRef = useRef(0);
  const lastSentRef = useRef(0);

  const applyState = useCallback((next) => {
    if (next?.serverNow) offsetRef.current = next.serverNow - Date.now();
    setState(next);
  }, []);

  useEffect(() => {
    if (initialState) applyState(initialState);
  }, [initialState, applyState]);

  useEffect(() => {
    if (initialYourPos != null) setMyPos(initialYourPos);
  }, [initialYourPos]);

  useEffect(() => {
    socket.on('mugunghwa:state', applyState);
    return () => socket.off('mugunghwa:state', applyState);
  }, [applyState]);

  useEffect(() => {
    const onPositions = (p) => setLivePositions(p);
    socket.on('mugunghwa:positions', onPositions);
    return () => socket.off('mugunghwa:positions', onPositions);
  }, []);

  useEffect(() => {
    if (state.status !== 'ended') setDismissed(false);
    // 새 라운드가 시작되면 출발선으로 되돌린다
    if (state.status === 'approaching') {
      setMyPos(0);
      setLivePositions(null);
    }
  }, [state.status, state.round]);

  const serverTime = useCallback(() => Date.now() + offsetRef.current, []);

  /**
   * 내 위치와 흔들림을 알린다.
   * 게임 루프가 매 프레임 부르므로 여기서 간격을 지켜 걸러낸다 — 60fps 그대로
   * 쏘면 서버가 감당하지 못한다. ack 는 받지 않는다.
   */
  const sendPos = useCallback(
    (pos, shake) => {
      const now = Date.now();
      if (now - lastSentRef.current < POSITION_SEND_MS) return;
      lastSentRef.current = now;
      socket.emit('mugunghwa:pos', { eventCode, pos, shake });
    },
    [eventCode],
  );

  /** 영희가 등을 돌리거나(green=true) 돌아본다(false). */
  const setLight = useCallback(
    (green) =>
      new Promise((resolve) => socket.emit('mugunghwa:light', { eventCode, green }, resolve)),
    [eventCode],
  );

  // 옵션은 통째로 넘긴다 (항목이 늘 때 빠뜨리지 않도록 — 미로에서 겪은 문제)
  const start = useCallback(
    (options = {}) =>
      new Promise((resolve) => socket.emit('mugunghwa:start', { eventCode, ...options }, resolve)),
    [eventCode],
  );
  const prepare = useCallback(
    () => new Promise((resolve) => socket.emit('mugunghwa:prepare', { eventCode }, resolve)),
    [eventCode],
  );
  const unprepare = useCallback(
    () => new Promise((resolve) => socket.emit('mugunghwa:unprepare', { eventCode }, resolve)),
    [eventCode],
  );
  const reportReady = useCallback(
    () => new Promise((resolve) => socket.emit('mugunghwa:ready', { eventCode }, resolve)),
    [eventCode],
  );
  const stop = useCallback(
    () => new Promise((resolve) => socket.emit('mugunghwa:stop', { eventCode }, resolve)),
    [eventCode],
  );
  const advance = useCallback(
    () => new Promise((resolve) => socket.emit('mugunghwa:advance', { eventCode }, resolve)),
    [eventCode],
  );
  const reset = useCallback(
    () => new Promise((resolve) => socket.emit('mugunghwa:reset', { eventCode }, resolve)),
    [eventCode],
  );
  const dismiss = useCallback(() => setDismissed(true), []);

  return {
    state,
    myPos,
    setMyPos,
    dismissed,
    livePositions,
    serverTime,
    sendPos,
    setLight,
    start,
    prepare,
    unprepare,
    reportReady,
    stop,
    advance,
    reset,
    dismiss,
  };
}
