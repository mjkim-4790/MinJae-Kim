import { useEffect, useState } from 'react';

import { socket } from '../lib/socket.js';

/**
 * 역할(role)과 이벤트 코드로 서버 룸에 접속하고, 연결 상태와 접속 현황을 돌려준다.
 * Phase 0 에서는 "3화면이 같은 룸에 붙었는가" 확인이 목적이고,
 * Phase 2 에서 실제 참여자 명단·메시지가 이 자리에 붙는다.
 *
 * @param {'operator'|'player'|'screen'} role
 * @param {string} [eventCode] 없으면 서버가 LOBBY 룸으로 처리
 */
export function useRealtimeSession(role, eventCode) {
  const [status, setStatus] = useState(socket.connected ? 'connected' : 'connecting');
  const [session, setSession] = useState(null);
  const [presence, setPresence] = useState(null);

  useEffect(() => {
    const hello = () => {
      setStatus('connected');
      socket.emit('session:hello', { role, eventCode }, (res) => {
        if (res?.ok) setSession(res.session);
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

  return { status, session, presence };
}
