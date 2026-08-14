import { useCallback, useEffect, useState } from 'react';

import { socket } from '../lib/socket.js';

const IDLE_STATE = {
  status: 'idle',
  round: 0,
  targetWinners: null,
  activeParticipantIds: [],
  chosenParticipantIds: [],
  confirmedWinnerIds: [],
  timerEndsAt: null,
  roundResult: null,
  operatorChoice: null,
  finalWinners: null,
};

/**
 * 가위바위보 서바이벌 실시간 상태 (설계문서 §6). session:hello/player:join 응답의
 * 초기 스냅샷으로 시작하고, 이후 game:state 브로드캐스트로 계속 동기화한다.
 * 운영자/스크린은 이 훅 하나로 관전, 참여자는 choose() 로 자기 선택도 함께 관리한다.
 *
 * @param {{ eventCode: string, participantId?: number|null, initialState?: object, initialYourChoice?: string|null }} args
 */
export function useRpsGame({ eventCode, participantId = null, initialState, initialYourChoice }) {
  const [state, setState] = useState(initialState ?? IDLE_STATE);
  const [yourChoice, setYourChoiceState] = useState(initialYourChoice ?? null);

  useEffect(() => {
    if (initialState) setState(initialState);
  }, [initialState]);

  useEffect(() => {
    setYourChoiceState(initialYourChoice ?? null);
  }, [initialYourChoice]);

  useEffect(() => {
    const onGameState = (next) => {
      setState(next);
      // 새 라운드가 시작됐는데 내가 아직 선택하지 않았다면 이전 선택 표시를 지운다
      if (
        participantId &&
        next.status === 'selecting' &&
        !next.chosenParticipantIds.includes(participantId)
      ) {
        setYourChoiceState(null);
      }
    };
    socket.on('game:state', onGameState);
    return () => socket.off('game:state', onGameState);
  }, [participantId]);

  const choose = useCallback(
    (choice) => {
      setYourChoiceState(choice); // 낙관적 업데이트 — 서버가 최종 판정
      return new Promise((resolve) => {
        socket.emit('rps:choose', { eventCode, choice }, (res) => {
          if (!res?.ok) setYourChoiceState(null);
          resolve(res);
        });
      });
    },
    [eventCode],
  );

  const start = useCallback(
    (targetWinners) =>
      new Promise((resolve) => socket.emit('rps:start', { eventCode, targetWinners }, resolve)),
    [eventCode],
  );
  const startTimer = useCallback(
    (seconds) => new Promise((resolve) => socket.emit('rps:timer', { eventCode, seconds }, resolve)),
    [eventCode],
  );
  const lock = useCallback(
    () => new Promise((resolve) => socket.emit('rps:lock', { eventCode }, resolve)),
    [eventCode],
  );
  const confirm = useCallback(
    (choice) => new Promise((resolve) => socket.emit('rps:confirm', { eventCode, choice }, resolve)),
    [eventCode],
  );
  const advance = useCallback(
    () => new Promise((resolve) => socket.emit('rps:advance', { eventCode }, resolve)),
    [eventCode],
  );
  const restartRound = useCallback(
    () => new Promise((resolve) => socket.emit('rps:restartRound', { eventCode }, resolve)),
    [eventCode],
  );
  const reset = useCallback(
    () => new Promise((resolve) => socket.emit('rps:reset', { eventCode }, resolve)),
    [eventCode],
  );

  return { state, yourChoice, choose, start, startTimer, lock, confirm, advance, restartRound, reset };
}
