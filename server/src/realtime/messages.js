import { isAuthorizedOperator } from './authz.js';
import { addMessage, deleteMessage, getOrCreateState, togglePin } from './eventState.js';
import { normalizeEventCode, roleRoom } from './rooms.js';

const TEXT_MAX_LENGTH = 200;

function audienceEmitter(io, code) {
  return io.to(roleRoom(code, 'operator')).to(roleRoom(code, 'player'));
}

export function registerMessageHandlers(io, socket) {
  socket.on('message:send', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    const text = String(payload.text ?? '').trim().slice(0, TEXT_MAX_LENGTH);

    if (!text) return reply({ ok: false, error: 'TEXT_REQUIRED' });

    const state = getOrCreateState(code);
    let authorType;
    let authorName;

    if (socket.data.role === 'operator') {
      if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });
      authorType = 'operator';
      authorName = socket.data.operatorName ?? 'MC';
    } else if (socket.data.role === 'player' && socket.data.participantId) {
      if (socket.data.eventCode !== code) return reply({ ok: false, error: 'FORBIDDEN' });
      if (!state.chatEnabled) return reply({ ok: false, error: 'CHAT_DISABLED' });
      authorType = 'player';
      authorName = socket.data.participantNickname ?? '참여자';
    } else {
      return reply({ ok: false, error: 'FORBIDDEN' });
    }

    const message = addMessage(state, { authorType, authorName, text });
    reply({ ok: true, message });
    audienceEmitter(io, code).emit('message:new', message);
  });

  socket.on('message:pin', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getOrCreateState(code);
    const pinnedMessageId = togglePin(state, Number(payload.messageId));
    reply({ ok: true, pinnedMessageId });
    audienceEmitter(io, code).emit('message:pinned', { pinnedMessageId });
  });

  socket.on('message:delete', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getOrCreateState(code);
    const messageId = Number(payload.messageId);
    deleteMessage(state, messageId);
    reply({ ok: true });
    audienceEmitter(io, code).emit('message:deleted', { messageId });
  });

  socket.on('chat:setEnabled', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getOrCreateState(code);
    state.chatEnabled = Boolean(payload.enabled);
    reply({ ok: true, chatEnabled: state.chatEnabled });
    audienceEmitter(io, code).emit('chat:state', {
      chatEnabled: state.chatEnabled,
      autoScroll: state.autoScroll,
    });
  });

  socket.on('chat:setAutoScroll', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    if (!isAuthorizedOperator(socket, code)) return reply({ ok: false, error: 'FORBIDDEN' });

    const state = getOrCreateState(code);
    state.autoScroll = Boolean(payload.autoScroll);
    reply({ ok: true, autoScroll: state.autoScroll });
    audienceEmitter(io, code).emit('chat:state', {
      chatEnabled: state.chatEnabled,
      autoScroll: state.autoScroll,
    });
  });
}
