import { getJoinableEventByCode } from '../db/events.js';
import {
  countActiveParticipants,
  createParticipant,
  findParticipant,
  touchLastSeen,
} from '../db/participants.js';
import { getAcrosticSnapshot, getYourAcrosticEntry } from './acrostic.js';
import { getValuesSnapshot, getYourValuesState } from './values.js';
import { getYabawiSnapshot, getYourYabawiPick } from './yabawi.js';
import { getWordcloudSnapshot, getYourWordcloudWords } from './wordcloud.js';
import { getMazeSnapshot, getYourMazeFinish } from './maze.js';
import { getOrCreateState, publicChatState } from './eventState.js';
import { getLiarSnapshot, getYourLiarWord } from './liar.js';
import { eventRoom, normalizeEventCode, roleRoom } from './rooms.js';
import { getRpsSnapshot, getYourChoice } from './rps.js';
import { getTypingSnapshot } from './typing.js';
import { buildScoreboard } from './scoreboard.js';

// 참여자 소켓 재접속/중복접속 처리 (설계문서 §4.3, §7-2)
//   - 닉네임+숫자4자리 = 재접속 키. 서버 재시작에도 살아남도록 DB(participants)에 저장.
//   - 어느 소켓이 어떤 참여자인지는 이벤트 진행 중에만 의미가 있으므로 메모리 맵으로 충분.
const socketIdByParticipant = new Map(); // participantId -> current socket.id

const NICKNAME_MAX = 12;
const PIN_PATTERN = /^\d{4}$/;

function publicParticipant(participant, { reconnected }) {
  return {
    id: participant.id,
    nickname: participant.nickname,
    teamId: participant.team_id,
    score: participant.score,
    status: participant.status,
    reconnected,
  };
}

function publicEvent(event) {
  return { code: event.code, name: event.name, mode: event.mode, status: event.status };
}

export function registerPlayerHandlers(io, socket, { broadcastPresence }) {
  socket.on('player:join', async (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};

    const code = normalizeEventCode(payload.eventCode);
    const nickname = String(payload.nickname ?? '').trim().slice(0, NICKNAME_MAX);
    const pin = String(payload.pin ?? '').trim();

    if (!nickname) return reply({ ok: false, error: 'NICKNAME_REQUIRED' });
    if (!PIN_PATTERN.test(pin)) return reply({ ok: false, error: 'INVALID_PIN' });

    const event = getJoinableEventByCode(code);
    if (!event) return reply({ ok: false, error: 'EVENT_NOT_FOUND' });

    let participant = findParticipant(event.id, nickname, pin);
    const reconnected = Boolean(participant);

    if (participant) {
      if (participant.status === 'removed') {
        return reply({ ok: false, error: 'PARTICIPANT_REMOVED' });
      }
      touchLastSeen(participant.id);
    } else {
      if (countActiveParticipants(event.id) >= event.max_participants) {
        return reply({ ok: false, error: 'EVENT_FULL' });
      }
      participant = createParticipant({ eventId: event.id, nickname, pin });
    }

    // 동일 참여자의 이전 연결이 남아있으면 대체 (한 사람 = 한 연결, §4.3)
    const previousSocketId = socketIdByParticipant.get(participant.id);
    if (previousSocketId && previousSocketId !== socket.id) {
      const previousSocket = io.sockets.sockets.get(previousSocketId);
      previousSocket?.emit('player:kicked', { reason: 'DUPLICATE_CONNECTION' });
      previousSocket?.disconnect(true);
    }
    socketIdByParticipant.set(participant.id, socket.id);

    socket.data.role = 'player';
    socket.data.eventCode = code;
    socket.data.participantId = participant.id;
    socket.data.participantNickname = participant.nickname;
    socket.join(eventRoom(code));
    socket.join(roleRoom(code, 'player'));

    const state = getOrCreateState(code, { logoUrl: event.logo_path });

    reply({
      ok: true,
      participant: publicParticipant(participant, { reconnected }),
      event: publicEvent(event),
      chat: publicChatState(state),
      rps: getRpsSnapshot(code),
      yourRpsChoice: getYourChoice(code, participant.id),
      liar: getLiarSnapshot(code),
      yourLiarWord: getYourLiarWord(code, participant.id),
      typing: getTypingSnapshot(code),
      acrostic: getAcrosticSnapshot(code),
      yourAcrosticEntry: getYourAcrosticEntry(code, participant.id),
      values: getValuesSnapshot(code),
      yourValuesState: getYourValuesState(code, participant.id),
      yabawi: getYabawiSnapshot(code),
      yourYabawiPick: getYourYabawiPick(code, participant.id),
      wordcloud: getWordcloudSnapshot(code),
      yourWordcloudWords: getYourWordcloudWords(code, participant.id),
      maze: getMazeSnapshot(code),
      yourMazeFinish: getYourMazeFinish(code, participant.id),
      scoreboard: buildScoreboard(event.id),
    });
    await broadcastPresence(io, code);
  });
}

export function clearPlayerSocket(participantId, socketId) {
  if (socketIdByParticipant.get(participantId) === socketId) {
    socketIdByParticipant.delete(participantId);
  }
}
