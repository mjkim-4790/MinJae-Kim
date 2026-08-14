import { useCallback, useEffect, useState } from 'react';

import { socket } from '../lib/socket.js';

/**
 * 실시간 메시지 공유 훅. 운영자 화면과 참여자 화면이 함께 쓴다 (설계문서 §5.1, §5.2).
 *
 * @param {string} eventCode
 * @param {{messages, chatEnabled, autoScroll, pinnedMessageId} | null} initialChat
 *   session:hello / player:join 응답에 들어있는 초기 스냅샷. 서버가 유일한 진실이므로
 *   재연결 때마다 이 값으로 로컬 상태를 덮어쓴다 (§7-1).
 * @param {boolean} canModerate 운영자 전용 기능(고정/삭제/토글) 노출 여부
 */
export function useChat(eventCode, initialChat, canModerate) {
  const [messages, setMessages] = useState([]);
  const [chatEnabled, setChatEnabledState] = useState(true);
  const [autoScroll, setAutoScrollState] = useState(true);
  const [pinnedMessageId, setPinnedMessageId] = useState(null);

  useEffect(() => {
    if (!initialChat) return;
    setMessages(initialChat.messages ?? []);
    setChatEnabledState(initialChat.chatEnabled ?? true);
    setAutoScrollState(initialChat.autoScroll ?? true);
    setPinnedMessageId(initialChat.pinnedMessageId ?? null);
  }, [initialChat]);

  useEffect(() => {
    const onNew = (message) => setMessages((prev) => [...prev, message]);
    const onDeleted = ({ messageId }) =>
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    const onPinned = ({ pinnedMessageId: id }) => setPinnedMessageId(id);
    const onChatState = (state) => {
      setChatEnabledState(state.chatEnabled);
      setAutoScrollState(state.autoScroll);
    };

    socket.on('message:new', onNew);
    socket.on('message:deleted', onDeleted);
    socket.on('message:pinned', onPinned);
    socket.on('chat:state', onChatState);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:deleted', onDeleted);
      socket.off('message:pinned', onPinned);
      socket.off('chat:state', onChatState);
    };
  }, []);

  const sendMessage = useCallback(
    (text) =>
      new Promise((resolve) => {
        socket.emit('message:send', { eventCode, text }, resolve);
      }),
    [eventCode],
  );

  const pinMessage = useCallback(
    (messageId) => socket.emit('message:pin', { eventCode, messageId }, () => {}),
    [eventCode],
  );

  const deleteMessage = useCallback(
    (messageId) => socket.emit('message:delete', { eventCode, messageId }, () => {}),
    [eventCode],
  );

  const setChatEnabled = useCallback(
    (enabled) => socket.emit('chat:setEnabled', { eventCode, enabled }, () => {}),
    [eventCode],
  );

  const setAutoScroll = useCallback(
    (value) => socket.emit('chat:setAutoScroll', { eventCode, autoScroll: value }, () => {}),
    [eventCode],
  );

  const pinnedMessage = messages.find((m) => m.id === pinnedMessageId) ?? null;

  return {
    messages,
    chatEnabled,
    autoScroll,
    pinnedMessage,
    sendMessage,
    ...(canModerate ? { pinMessage, deleteMessage, setChatEnabled, setAutoScroll } : {}),
  };
}
