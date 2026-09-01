import { Server } from 'socket.io';

import { sessionMiddleware } from '../auth/session.js';
import { config } from '../config.js';
import { byId as getOperatorById } from '../db/operators.js';
import { getEventByCode } from '../db/events.js';
import { getOrCreateState, publicChatState } from './eventState.js';
import { clearPlayerSocket, registerPlayerHandlers } from './players.js';
import { registerMessageHandlers } from './messages.js';
import { getAcrosticSnapshot, registerAcrosticHandlers } from './acrostic.js';
import { getLiarSnapshot, registerLiarHandlers } from './liar.js';
import { getRpsSnapshot, registerRpsHandlers } from './rps.js';
import { getTypingSnapshot, registerTypingHandlers } from './typing.js';
import { getValuesSnapshot, registerValuesHandlers } from './values.js';
import { getYabawiSnapshot, registerYabawiHandlers } from './yabawi.js';
import { getWordcloudSnapshot, registerWordcloudHandlers } from './wordcloud.js';
import { getMazeSnapshot, registerMazeHandlers } from './maze.js';
import { getChairsSnapshot, registerChairsHandlers } from './chairs.js';
import { buildScoreboard } from './scoreboard.js';
import {
  countInRoom,
  eventRoom,
  LOBBY_CODE,
  normalizeEventCode,
  normalizeRole,
  roleRoom,
} from './rooms.js';
import { registerScreenHandlers } from './screen.js';

// 3화면(운영자/참여자/스크린)이 같은 룸에 접속한다 (session:hello).
// 참여자는 추가로 player:join 으로 닉네임+숫자4자리 신원을 확인/재접속한다 (players.js).
// 운영자는 로그인 세션 + 이벤트 소유권을 확인해야 스크린 전환/메시지 삭제 등을 할 수 있다 (authz.js).
// 가위바위보 게임 상태 머신은 rps.js (§6).

export function createRealtime(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigins, credentials: true },
  });

  // HTTP 로그인 세션을 소켓 핸드셰이크에서도 읽을 수 있게 연결 (운영자 권한 확인용)
  io.engine.use(sessionMiddleware);

  io.on('connection', (socket) => {
    socket.data.role = null;
    socket.data.eventCode = null;
    socket.data.participantId = null;
    socket.data.isAuthenticatedOperator = false;

    registerPlayerHandlers(io, socket, { broadcastPresence });
    registerScreenHandlers(io, socket);
    registerMessageHandlers(io, socket);
    registerRpsHandlers(io, socket);
    registerLiarHandlers(io, socket);
    registerTypingHandlers(io, socket);
    registerAcrosticHandlers(io, socket);
    registerValuesHandlers(io, socket);
    registerYabawiHandlers(io, socket);
    registerWordcloudHandlers(io, socket);
    registerMazeHandlers(io, socket);
    registerChairsHandlers(io, socket);

    // 클라이언트가 자기 역할과 이벤트 코드를 알린다.
    socket.on('session:hello', async (payload = {}, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const role = normalizeRole(payload.role);
      const code = normalizeEventCode(payload.eventCode);

      let event = null;
      if (code !== LOBBY_CODE) event = getEventByCode(code);

      if (role === 'operator') {
        const operatorId = socket.request.session?.operatorId;
        if (!operatorId) return reply({ ok: false, error: 'LOGIN_REQUIRED' });
        if (code !== LOBBY_CODE && (!event || event.operator_id !== operatorId)) {
          return reply({ ok: false, error: 'FORBIDDEN' });
        }
        const operator = getOperatorById(operatorId);
        socket.data.isAuthenticatedOperator = true;
        socket.data.operatorId = operatorId;
        socket.data.operatorName = operator?.name ?? 'MC';
      }

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

      const response = { ok: true, session };
      if (code !== LOBBY_CODE) {
        const state = getOrCreateState(code, { logoUrl: event?.logo_path });
        response.chat = publicChatState(state);
        response.screenMode = state.screenMode;
        response.rps = getRpsSnapshot(code);
        response.liar = getLiarSnapshot(code);
        response.typing = getTypingSnapshot(code);
        response.acrostic = getAcrosticSnapshot(code);
        response.values = getValuesSnapshot(code);
        response.yabawi = getYabawiSnapshot(code);
        response.wordcloud = getWordcloudSnapshot(code);
        response.maze = getMazeSnapshot(code);
        response.chairs = getChairsSnapshot(code);
        if (event) response.scoreboard = buildScoreboard(event.id);
        if (role === 'screen' && event) {
          response.event = {
            code: event.code,
            name: event.name,
            mode: event.mode,
            logoUrl: event.logo_path ? `/uploads/${event.logo_path}` : null,
          };
        }
      }

      reply(response);
      await broadcastPresence(io, code);
    });

    // 연결 상태/지연 확인용 (운영 리허설 때 왕복 시간 확인)
    socket.on('session:ping', (payload = {}, ack) => {
      if (typeof ack === 'function') {
        ack({ ok: true, sentAt: payload.sentAt ?? null, serverTime: Date.now() });
      }
    });

    socket.on('disconnect', async () => {
      if (socket.data.participantId) {
        clearPlayerSocket(socket.data.participantId, socket.id);
      }
      if (socket.data.eventCode) await broadcastPresence(io, socket.data.eventCode);
    });
  });

  return io;
}

// 룸별 접속 현황 브로드캐스트.
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
