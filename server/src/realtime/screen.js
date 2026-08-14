import { isAuthorizedOperator } from './authz.js';
import { getOrCreateState } from './eventState.js';
import { normalizeEventCode, roleRoom } from './rooms.js';

const VALID_MODES = new Set(['logo', 'qr', 'ranking']);

export function registerScreenHandlers(io, socket) {
  socket.on('screen:setMode', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const code = normalizeEventCode(payload.eventCode);
    const mode = payload.mode;

    if (!isAuthorizedOperator(socket, code)) {
      return reply({ ok: false, error: 'FORBIDDEN' });
    }
    if (!VALID_MODES.has(mode)) {
      return reply({ ok: false, error: 'INVALID_MODE' });
    }

    const state = getOrCreateState(code);
    state.screenMode = mode;

    reply({ ok: true, mode });
    io.to(roleRoom(code, 'screen')).to(roleRoom(code, 'operator')).emit('screen:mode', { mode });
  });
}
