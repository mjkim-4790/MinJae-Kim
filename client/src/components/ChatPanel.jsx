import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { springPop, springSettle } from '../lib/motionPresets.js';

/**
 * 실시간 메시지 패널. 운영자 화면(moderator=true)과 참여자 화면이 공유한다.
 */
export default function ChatPanel({
  messages,
  pinnedMessage,
  chatEnabled,
  autoScroll,
  canSend,
  onSend,
  moderator, // { onPin, onDelete, onToggleChat, onToggleAutoScroll } — 있으면 운영자 컨트롤 노출
}) {
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (!autoScroll || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, autoScroll]);

  const submit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    <div className="chat">
      {moderator && (
        <div className="chat__toolbar">
          <label className="chat__toggle">
            <input
              type="checkbox"
              checked={chatEnabled}
              onChange={(e) => moderator.onToggleChat(e.target.checked)}
            />
            참여자 채팅 허용
          </label>
          <label className="chat__toggle">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => moderator.onToggleAutoScroll(e.target.checked)}
            />
            자동 스크롤
          </label>
        </div>
      )}

      <AnimatePresence>
        {pinnedMessage && (
          <motion.div
            key={pinnedMessage.id}
            className="chat__pinned"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={springPop}
          >
            <span className="chat__pinned-label">📌 {pinnedMessage.authorName}</span>
            <span className="chat__pinned-text">{pinnedMessage.text}</span>
            {moderator && (
              <button className="chat__icon-btn" onClick={() => moderator.onPin(pinnedMessage.id)}>
                고정 해제
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="chat__list" ref={listRef}>
        {messages.length === 0 && <p className="subtitle">아직 메시지가 없습니다.</p>}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              className={`chat__message chat__message--${m.authorType}`}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={springSettle}
            >
              <div className="chat__message-meta">
                <span className="chat__author">{m.authorName}</span>
                <span className="chat__time">
                  {new Date(m.createdAt).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="chat__text">{m.text}</p>
              {moderator && (
                <div className="chat__row-actions">
                  <button className="chat__icon-btn" onClick={() => moderator.onPin(m.id)}>
                    고정
                  </button>
                  <button className="chat__icon-btn" onClick={() => moderator.onDelete(m.id)}>
                    삭제
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {canSend ? (
        <form className="chat__compose" onSubmit={submit}>
          <input
            className="input"
            placeholder="메시지 입력"
            maxLength={200}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="button" type="submit" disabled={!draft.trim()}>
            보내기
          </button>
        </form>
      ) : (
        !moderator && <p className="subtitle">채팅이 비활성화되어 있습니다.</p>
      )}
    </div>
  );
}
