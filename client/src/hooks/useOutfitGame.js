import { useCallback, useEffect, useState } from 'react';

import { socket } from '../lib/socket.js';

const IDLE_STATE = {
  status: 'idle',
  currentId: null,
  currentNickname: null,
  doneIds: [],
  doneCount: 0,
  outfitCount: 0,
  maxOutfits: 6,
  selectedId: null,
  outfits: undefined, // 아이패드(스크린)에서만 채워진다
};

/**
 * '옷 입어보기' 실시간 상태.
 *
 * 서버는 두 갈래로 방송한다 — 참가자·진행자는 사진 없는 가벼운 상태를, 아이패드
 * (스크린)만 사진이 든 상태를 받는다. 이 훅은 어느 화면에서 쓰든 그냥
 * `outfit:state` 를 받아 그대로 반영한다 — 화면이 스크린 역할이 아니면 애초에
 * 사진 있는 이벤트가 오지 않으므로 따로 가릴 필요가 없다.
 */
export function useOutfitGame({ eventCode, initialState }) {
  const [state, setState] = useState(initialState ?? IDLE_STATE);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (initialState) setState(initialState);
  }, [initialState]);

  useEffect(() => {
    // 서버가 같은 이벤트를 두 번 보낸다 — 참가자·진행자용(사진 없음)과 아이패드
    // (스크린)용(사진 포함)이 순서대로 온다. 아이패드 소켓은 둘 다 받는데, 사진
    // 없는 쪽이 나중에 와도 outfits 키 자체가 없으니 얕은 병합이면 방금 받은
    // 사진을 지우지 않는다 — 통째로 교체(setState(next))하면 이 경우 사진이
    // 잠깐 사라졌다 다시 나타나는 깜빡임이 생긴다.
    const onState = (next) => setState((prev) => ({ ...prev, ...next }));
    socket.on('outfit:state', onState);
    return () => socket.off('outfit:state', onState);
  }, []);

  useEffect(() => {
    if (state.status !== 'ended') setDismissed(false);
  }, [state.status]);

  const call = useCallback(
    (event, payload = {}) =>
      new Promise((resolve) => socket.emit(event, { eventCode, ...payload }, resolve)),
    [eventCode],
  );

  const setup = useCallback(() => call('outfit:setup'), [call]);
  const leave = useCallback(() => call('outfit:leave'), [call]);
  const callPlayer = useCallback((participantId) => call('outfit:call', { participantId }), [call]);
  const start = useCallback(() => call('outfit:start'), [call]);
  const upload = useCallback((dataUrl) => call('outfit:upload', { dataUrl }), [call]);
  const select = useCallback((outfitId) => call('outfit:select', { outfitId }), [call]);
  const next = useCallback(() => call('outfit:next'), [call]);
  const end = useCallback(() => call('outfit:end'), [call]);
  const reset = useCallback(() => call('outfit:reset'), [call]);
  const dismiss = useCallback(() => setDismissed(true), []);

  return { state, dismissed, setup, leave, callPlayer, start, upload, select, next, end, reset, dismiss };
}
