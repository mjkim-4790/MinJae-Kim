import { Server } from 'socket.io';

import { config } from '../config.js';
import {
  countInRoom,
  eventRoom,
  normalizeEventCode,
  normalizeRole,
  roleRoom,
} from './rooms.js';

// Phase 0: 3화면(운영자/참여자/스크린)이 서버와 같은 룸에서 연결되는지까지만 확인한다.
// 이벤트 개설·참여자 식별·게임 상태 머신은 Phase 1~3 에서 이 위에 얹는다.

export function createRealtime(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigins, credentials: true },
  });

  io.on('connection', (socket) => {
    socket.data.role = null;
    socket.data.eventCode = null;

    // 클라이언트가 자기 역할과 이벤트 코드를 알린다.
    socket.on('session:hello', async (payload = {}, ack) => {
      const role = normalizeRole(payload.role);
      const code = normalizeEventCode(payload.eventCode);

      // 이전 룸에서 나가고 새 룸으로 (역할/이벤트가 바뀌는 경우 대비)
      if (socket.data.eventCode) {
        socket.leave(eventRoom(socket.data.eventCode));
        socket.leave(roleRoom(socket.data.eventCode, socket.data.role));
      }

      socket.data.role = role;
      socket.data.eventCode = code;
      socket.join(eventRoom(code));
      socket.join(roleRoom(code, role));

      const session = {
        socketId: socket.id,
        role,
        eventCode: code,
        serverTime: new Date().toISOString(),
      };

      if (typeof ack === 'function') ack({ ok: true, session });
      await broadcastPresence(io, code);
    });

    // 연결 상태/지연 확인용 (운영 리허설 때 왕복 시간 확인)
    socket.on('session:ping', (payload = {}, ack) => {
      if (typeof ack === 'function') {
        ack({ ok: true, sentAt: payload.sentAt ?? null, serverTime: Date.now() });
      }
    });

    socket.on('disconnect', async () => {
      if (socket.data.eventCode) await broadcastPresence(io, socket.data.eventCode);
    });
  });

  return io;
}

// 룸별 접속 현황 브로드캐스트.
// Phase 2 에서 실제 참여자 명단/스로틀링(설계문서 §7-3)을 붙일 자리.
async function broadcastPresence(io, eventCode) {
  const code = normalizeEventCode(eventCode);
  const presence = {
    eventCode: code,
    operators: await countInRoom(io, roleRoom(code, 'operator')),
    players: await countInRoom(io, roleRoom(code, 'player')),
    screens: await countInRoom(io, roleRoom(code, 'screen')),
    updatedAt: new Date().toISOString(),
  };

  io.to(eventRoom(code)).emit('presence:update', presence);
}
