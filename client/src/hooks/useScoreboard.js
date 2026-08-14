import { useEffect, useState } from 'react';

import { socket } from '../lib/socket.js';

const EMPTY = { participants: [], teamScores: [] };

/**
 * 개인 순위(점수 내림차순) + 팀전이면 팀별 합산 순위. session:hello/player:join
 * 응답의 초기 스냅샷으로 시작하고, 이후 scoreboard:update 브로드캐스트로 동기화한다
 * (§9 결정 — 최종 승자 점수 부여, 팀 순위는 팀원 점수 합산).
 */
export function useScoreboard(initialState) {
  const [state, setState] = useState(initialState ?? EMPTY);

  useEffect(() => {
    if (initialState) setState(initialState);
  }, [initialState]);

  useEffect(() => {
    const onUpdate = (data) => setState(data);
    socket.on('scoreboard:update', onUpdate);
    return () => socket.off('scoreboard:update', onUpdate);
  }, []);

  return state;
}
