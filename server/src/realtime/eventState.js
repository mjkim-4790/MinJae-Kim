import { normalizeEventCode } from './rooms.js';

// 이벤트별 실시간 상태 (설계문서 §4.2 — 서버 메모리, DB 에 영구 저장하지 않음).
//   screenMode: 'logo' | 'qr'   (게임/순위 모드는 Phase 3~4 에서 추가)
//   chatEnabled: 참여자가 메시지를 보낼 수 있는지 (MC 토글)
//   autoScroll: 메시지 피드가 새 메시지에 자동으로 스크롤되는지 (MC 토글)
//   pinnedMessageId: 상단 고정된 메시지 id (없으면 null)
//   messages: 최근 메시지 목록 (최대 MAX_MESSAGES개만 보관)

const MAX_MESSAGES = 200;

const states = new Map(); // eventCode -> state

let nextMessageId = 1;

function createState(event) {
  return {
    screenMode: event?.logoUrl ? 'logo' : 'qr',
    chatEnabled: true,
    autoScroll: true,
    pinnedMessageId: null,
    messages: [],
  };
}

export function getOrCreateState(eventCode, event) {
  const code = normalizeEventCode(eventCode);
  let state = states.get(code);
  if (!state) {
    state = createState(event);
    states.set(code, state);
  }
  return state;
}

export function clearState(eventCode) {
  states.delete(normalizeEventCode(eventCode));
}

export function publicChatState(state) {
  return {
    messages: state.messages,
    chatEnabled: state.chatEnabled,
    autoScroll: state.autoScroll,
    pinnedMessageId: state.pinnedMessageId,
  };
}

export function addMessage(state, { authorType, authorName, text }) {
  const message = {
    id: nextMessageId++,
    authorType, // 'operator' | 'player'
    authorName,
    text,
    createdAt: new Date().toISOString(),
  };
  state.messages.push(message);
  if (state.messages.length > MAX_MESSAGES) state.messages.shift();
  return message;
}

export function deleteMessage(state, messageId) {
  state.messages = state.messages.filter((m) => m.id !== messageId);
  if (state.pinnedMessageId === messageId) state.pinnedMessageId = null;
}

export function togglePin(state, messageId) {
  const exists = state.messages.some((m) => m.id === messageId);
  if (!exists) return state.pinnedMessageId;
  state.pinnedMessageId = state.pinnedMessageId === messageId ? null : messageId;
  return state.pinnedMessageId;
}
