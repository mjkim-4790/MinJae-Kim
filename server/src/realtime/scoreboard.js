import { listParticipantsByEvent, listTeamScores } from '../db/participants.js';
import { eventRoom, normalizeEventCode } from './rooms.js';

function publicParticipant(p) {
  return {
    id: p.id,
    nickname: p.nickname,
    teamId: p.team_id,
    score: p.score,
    status: p.status,
  };
}

/** 개인 순위(점수 내림차순) + 팀전이면 팀별 합산 순위까지 함께 계산한다 (§9 결정). */
export function buildScoreboard(eventId) {
  return {
    participants: listParticipantsByEvent(eventId).map(publicParticipant),
    teamScores: listTeamScores(eventId).map((t) => ({
      teamId: t.teamId,
      total: t.total,
      memberCount: t.memberCount,
    })),
  };
}

export function broadcastScoreboard(io, eventCode, eventId) {
  const code = normalizeEventCode(eventCode);
  io.to(eventRoom(code)).emit('scoreboard:update', buildScoreboard(eventId));
}
