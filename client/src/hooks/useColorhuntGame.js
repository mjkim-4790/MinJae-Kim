import { useCallback, useEffect, useRef, useState } from 'react';

import { socket } from '../lib/socket.js';

const IDLE_STATE = {
  status: 'idle',
  round: 0,
  target: null,
  tolerance: 1,
  startedAt: null,
  readyIds: [],
  tiles: [],
  passedCount: 0,
  submittedCount: 0,
  roundCount: 0,
  lastRound: null,
  palette: [],
  ranking: null,
};

/**
 * '색깔 사냥' 실시간 상태.
 *
 * 제출은 hex 문자열 하나만 올라가고 통과 여부는 서버가 정한다. 그래서 여기서는
 * 낙관적 반영을 하지 않는다 — 화면이 먼저 "통과!"를 띄웠다가 서버가 아니라고 하면
 * 그 번복이 오판정보다 나쁘다.
 */
export function useColorhuntGame({ eventCode, initialState, initialYours }) {
  const [state, setState] = useState(initialState ?? IDLE_STATE);
  const [mine, setMine] = useState(initialYours ?? null);
  const [dismissed, setDismissed] = useState(false);

  // 지금 보고 있는 라운드. "새 라운드가 열렸으니 내 기록을 비운다"를 판단하는 기준이다.
  const roundRef = useRef(initialState?.round ?? 0);

  // 재접속 복원 — 라운드 번호를 **받아들이기만** 하고 내 기록은 건드리지 않는다.
  // 여기서 비우면 라운드 도중 새로고침한 사람이 '이미 통과함'을 잃고 카메라를 다시 보게 된다
  // (설계문서 §7-1 — 어느 단계에 들어와도 화면이 복원돼야 한다).
  useEffect(() => {
    if (!initialState) return;
    roundRef.current = initialState.round;
    setState(initialState);
  }, [initialState]);

  useEffect(() => {
    if (initialYours !== undefined) setMine(initialYours);
  }, [initialYours]);

  useEffect(() => {
    const onState = (next) => {
      // 라운드가 실제로 넘어간 순간에만 비운다. 복원과 달리 이건 살아 있는 전환이다.
      if (next.round !== roundRef.current) {
        roundRef.current = next.round;
        setMine(null);
      }
      setState(next);
    };
    socket.on('colorhunt:state', onState);
    return () => socket.off('colorhunt:state', onState);
  }, []);

  useEffect(() => {
    if (state.status !== 'ended') setDismissed(false);
  }, [state.status]);

  const call = useCallback(
    (event, payload = {}) =>
      new Promise((resolve) => socket.emit(event, { eventCode, ...payload }, resolve)),
    [eventCode],
  );

  // options 를 통째로 펼쳐 넘긴다. 필드를 손으로 나열하면 나중에 옵션을 하나 더
  // 붙였을 때 서버까지 안 가고 조용히 사라진다 (미로 난이도에서 겪은 사고).
  const ask = useCallback((options = {}) => call('colorhunt:ask', options), [call]);

  const submit = useCallback(
    async (hex) => {
      const res = await call('colorhunt:submit', { hex });
      if (res?.ok) setMine({ attempts: res.attempts, passed: res.pass, hex, points: res.points });
      // 서버가 "이미 통과했다"고 하면 화면이 뒤처진 것이다 — 서버 말을 따른다
      else if (res?.error === 'ALREADY_PASSED') setMine((m) => ({ ...(m ?? { attempts: 1, hex }), passed: true }));
      return res;
    },
    [call],
  );

  const prepare = useCallback(() => call('colorhunt:prepare'), [call]);
  const unprepare = useCallback(() => call('colorhunt:unprepare'), [call]);
  const ready = useCallback(() => call('colorhunt:ready'), [call]);
  const close = useCallback(() => call('colorhunt:close'), [call]);
  const end = useCallback(() => call('colorhunt:end'), [call]);
  const reset = useCallback(() => call('colorhunt:reset'), [call]);
  const dismiss = useCallback(() => setDismissed(true), []);

  return { state, mine, dismissed, ask, submit, prepare, unprepare, ready, close, end, reset, dismiss };
}
