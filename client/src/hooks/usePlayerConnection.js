import { useCallback, useEffect, useRef, useState } from 'react';

import { socket } from '../lib/socket.js';

/**
 * 참여자(닉네임+숫자4자리) 입장/재접속 전담 훅.
 *
 * - join(nickname, pin) 으로 최초 입장
 * - 연결이 끊겼다 자동 재연결되면(§7-1) 같은 신원으로 서버에 다시 player:join 하여
 *   점수/상태를 그대로 복원한다 (§4.3)
 * - 같은 신원으로 다른 기기가 접속하면 이 소켓은 서버가 끊는다 (player:kicked, §4.3)
 */
export function usePlayerConnection(eventCode) {
  const [status, setStatus] = useState('idle'); // idle | connecting | joined | reconnecting | kicked | error
  const [participant, setParticipant] = useState(null);
  const [event, setEvent] = useState(null);
  const [chat, setChat] = useState(null);
  const [rps, setRps] = useState(null);
  const [yourRpsChoice, setYourRpsChoice] = useState(null);
  const [liar, setLiar] = useState(null);
  const [yourLiarWord, setYourLiarWord] = useState(null);
  const [typingGame, setTypingGame] = useState(null);
  const [scoreboard, setScoreboard] = useState(null);
  const [error, setError] = useState(null);

  const identityRef = useRef(null); // {nickname, pin} — 재연결 시 재사용
  const needsRejoinRef = useRef(false);

  const performJoin = useCallback(
    (nickname, pin) =>
      new Promise((resolve) => {
        socket.emit('player:join', { eventCode, nickname, pin }, (res) => {
          if (res.ok) {
            identityRef.current = { nickname, pin };
            setParticipant(res.participant);
            setEvent(res.event);
            setChat(res.chat);
            setRps(res.rps);
            setYourRpsChoice(res.yourRpsChoice ?? null);
            setLiar(res.liar);
            setYourLiarWord(res.yourLiarWord ?? null);
            setTypingGame(res.typing);
            setScoreboard(res.scoreboard);
            setError(null);
            setStatus('joined');
          } else {
            setError(res.error);
            setStatus('error');
          }
          resolve(res);
        });
      }),
    [eventCode],
  );

  const join = useCallback(
    (nickname, pin) => {
      setStatus('connecting');
      setError(null);
      if (socket.connected) return performJoin(nickname, pin);
      return new Promise((resolve) => {
        socket.once('connect', () => resolve(performJoin(nickname, pin)));
        socket.connect();
      });
    },
    [performJoin],
  );

  useEffect(() => {
    const onDisconnect = () => {
      if (identityRef.current) {
        needsRejoinRef.current = true;
        setStatus('reconnecting');
      }
    };
    const onConnect = () => {
      if (needsRejoinRef.current && identityRef.current) {
        needsRejoinRef.current = false;
        const { nickname, pin } = identityRef.current;
        performJoin(nickname, pin);
      }
    };
    const onKicked = () => {
      identityRef.current = null;
      setStatus('kicked');
    };

    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);
    socket.on('player:kicked', onKicked);
    return () => {
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
      socket.off('player:kicked', onKicked);
    };
  }, [performJoin]);

  return {
    status,
    participant,
    event,
    chat,
    rps,
    yourRpsChoice,
    liar,
    yourLiarWord,
    typingGame,
    scoreboard,
    error,
    join,
  };
}
