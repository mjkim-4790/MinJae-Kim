import { useCallback, useEffect, useState } from 'react';

import { socket } from '../lib/socket.js';

const IDLE_STATE = {
  status: 'idle',
  difficulty: null,
  round: 0,
  activeParticipantIds: [],
  pickedParticipantIds: [],
  plan: null,
  answerSlot: null,
  result: null,
};

/**
 * '야바위 게임' 실시간 상태 (useRpsGame.js 와 같은 구조).
 *
 * 섞기 순서(plan)는 판이 시작될 때 한 번에 통째로 내려온다 — 스왑마다 소켓을 왕복하면
 * 네트워크 지터가 그대로 프레임 끊김이 되기 때문이다. 재생은 각 기기가 로컬에서 한다.
 *
 * @param {{ eventCode: string, initialState?: object, initialYourPick?: number|null }} args
 */
export function useYabawiGame({ eventCode, initialState, initialYourPick }) {
  const [state, setState] = useState(initialState ?? IDLE_STATE);
  const [myPick, setMyPick] = useState(initialYourPick ?? null);
  // 참여자가 스스로 "확인"을 눌러 종료 화면을 닫고 원래 화면으로 돌아가기 위한 로컬 상태
  // (다른 게임들과 동일한 이유).
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (initialState) setState(initialState);
  }, [initialState]);

  useEffect(() => {
    if (initialYourPick !== undefined) setMyPick(initialYourPick);
  }, [initialYourPick]);

  useEffect(() => {
    const onState = (next) => setState(next);
    socket.on('yabawi:state', onState);
    return () => socket.off('yabawi:state', onState);
  }, []);

  useEffect(() => {
    if (state.status !== 'ended') setDismissed(false);
    // 새 판이 시작되면 지난 판에 고른 자리는 지운다
    if (state.status === 'shuffling' || state.status === 'idle') setMyPick(null);
  }, [state.status, state.round]);

  const start = useCallback(
    (difficultyId) =>
      new Promise((resolve) => socket.emit('yabawi:start', { eventCode, difficultyId }, resolve)),
    [eventCode],
  );
  const pick = useCallback(
    (slot) =>
      new Promise((resolve) =>
        socket.emit('yabawi:pick', { eventCode, slot }, (res) => {
          if (res?.ok) setMyPick(res.slot);
          resolve(res);
        }),
      ),
    [eventCode],
  );
  const reveal = useCallback(
    () => new Promise((resolve) => socket.emit('yabawi:reveal', { eventCode }, resolve)),
    [eventCode],
  );
  const advance = useCallback(
    () => new Promise((resolve) => socket.emit('yabawi:advance', { eventCode }, resolve)),
    [eventCode],
  );
  const reset = useCallback(
    () => new Promise((resolve) => socket.emit('yabawi:reset', { eventCode }, resolve)),
    [eventCode],
  );
  const dismiss = useCallback(() => setDismissed(true), []);

  return { state, myPick, dismissed, start, pick, reveal, advance, reset, dismiss };
}
