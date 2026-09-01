import { useEffect, useState } from 'react';

import { socket } from '../lib/socket.js';

/**
 * 역할(role)과 이벤트 코드로 서버 룸에 접속하고, 연결 상태와 접속 현황을 돌려준다.
 * 운영자/스크린 역할은 접속 시 채팅·가위바위보 게임·스코어보드 초기 상태와
 * 스크린 모드도 함께 받는다 (재접속 시 어느 단계든 즉시 복원 — 설계문서 §7-1).
 *
 * @param {'operator'|'player'|'screen'} role
 * @param {string} [eventCode] 없으면 서버가 LOBBY 룸으로 처리
 */
export function useRealtimeSession(role, eventCode) {
  const [status, setStatus] = useState(socket.connected ? 'connected' : 'connecting');
  const [session, setSession] = useState(null);
  const [presence, setPresence] = useState(null);
  const [init, setInit] = useState(null); // { chat, screenMode, rps, liar, typing, acrostic, values, yabawi, scoreboard, event? }
  const [error, setError] = useState(null);

  useEffect(() => {
    const hello = () => {
      setStatus('connected');
      socket.emit('session:hello', { role, eventCode }, (res) => {
        if (res?.ok) {
          setSession(res.session);
          setInit({
            chat: res.chat,
            screenMode: res.screenMode,
            rps: res.rps,
            liar: res.liar,
            typing: res.typing,
            acrostic: res.acrostic,
            values: res.values,
            yabawi: res.yabawi,
            wordcloud: res.wordcloud,
            scoreboard: res.scoreboard,
            event: res.event,
          });
          setError(null);
        } else {
          setError(res?.error ?? 'UNKNOWN_ERROR');
        }
      });
    };

    const onDisconnect = () => setStatus('disconnected');
    const onReconnecting = () => setStatus('connecting');
    const onPresence = (data) => setPresence(data);

    socket.on('connect', hello);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnecting);
    socket.on('presence:update', onPresence);

    if (socket.connected) hello();
    else socket.connect();

    return () => {
      socket.off('connect', hello);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onReconnecting);
      socket.off('presence:update', onPresence);
    };
  }, [role, eventCode]);

  return { status, session, presence, init, error };
}
