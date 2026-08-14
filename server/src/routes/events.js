import { Router } from 'express';

import { requireOperator } from '../auth/middleware.js';
import {
  createEvent,
  getEventById,
  listEventsByOperator,
  setEventStatus,
} from '../db/events.js';
import { listGameRecordsByEvent } from '../db/gameRecords.js';
import { assignRandomTeams, countActiveParticipants, listParticipantsByEvent, listTeamScores } from '../db/participants.js';
import { broadcastScoreboard } from '../realtime/scoreboard.js';
import { uploadLogo } from '../uploads.js';

export const eventsRouter = Router();
eventsRouter.use(requireOperator);

const VALID_MODES = new Set(['individual', 'team']);

function toPublicEvent(event) {
  return {
    id: event.id,
    code: event.code,
    name: event.name,
    mode: event.mode,
    maxParticipants: event.max_participants,
    logoUrl: event.logo_path ? `/uploads/${event.logo_path}` : null,
    scheduledAt: event.scheduled_at,
    status: event.status,
    createdAt: event.created_at,
    endedAt: event.ended_at,
  };
}

function toPublicParticipant(p) {
  return {
    id: p.id,
    nickname: p.nickname,
    teamId: p.team_id,
    score: p.score,
    status: p.status,
    joinedAt: p.joined_at,
  };
}

function ownedEventOr404(req, res) {
  const event = getEventById(Number(req.params.id));
  if (!event || event.operator_id !== req.operator.id) {
    res.status(404).json({ ok: false, error: 'EVENT_NOT_FOUND' });
    return null;
  }
  return event;
}

eventsRouter.get('/', (req, res) => {
  const events = listEventsByOperator(req.operator.id).map(toPublicEvent);
  res.json({ ok: true, events });
});

eventsRouter.post('/', uploadLogo, (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const mode = VALID_MODES.has(req.body?.mode) ? req.body.mode : 'individual';
  const maxParticipants = Math.min(
    500,
    Math.max(1, Number(req.body?.maxParticipants) || 50),
  );
  const scheduledAt = req.body?.scheduledAt ? String(req.body.scheduledAt) : null;

  if (!name) {
    return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
  }

  const event = createEvent({
    operatorId: req.operator.id,
    name,
    mode,
    maxParticipants,
    scheduledAt,
    logoPath: req.file?.filename ?? null,
  });

  res.status(201).json({ ok: true, event: toPublicEvent(event) });
});

eventsRouter.get('/:id', (req, res) => {
  const event = ownedEventOr404(req, res);
  if (!event) return;

  const participants = listParticipantsByEvent(event.id).map(toPublicParticipant);
  const gameRecords = listGameRecordsByEvent(event.id);
  const teamScores = event.mode === 'team' ? listTeamScores(event.id) : [];

  res.json({ ok: true, event: toPublicEvent(event), participants, gameRecords, teamScores });
});

eventsRouter.post('/:id/start', (req, res) => {
  const event = ownedEventOr404(req, res);
  if (!event) return;
  if (event.status !== 'scheduled') {
    return res.status(409).json({ ok: false, error: 'INVALID_STATUS' });
  }
  res.json({ ok: true, event: toPublicEvent(setEventStatus(event.id, 'active')) });
});

eventsRouter.post('/:id/end', (req, res) => {
  const event = ownedEventOr404(req, res);
  if (!event) return;
  if (event.status === 'ended') {
    return res.status(409).json({ ok: false, error: 'INVALID_STATUS' });
  }
  res.json({ ok: true, event: toPublicEvent(setEventStatus(event.id, 'ended')) });
});

// 팀 자동 배정 (§9 결정) — 다시 호출하면 현재 참여자를 전부 새로 섞어 재배정한다.
eventsRouter.post('/:id/teams/assign', (req, res) => {
  const event = ownedEventOr404(req, res);
  if (!event) return;
  if (event.mode !== 'team') {
    return res.status(400).json({ ok: false, error: 'NOT_TEAM_MODE' });
  }
  if (event.status === 'ended') {
    return res.status(409).json({ ok: false, error: 'INVALID_STATUS' });
  }

  const teamCount = Number(req.body?.teamCount);
  const activeCount = countActiveParticipants(event.id);

  if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > 10) {
    return res.status(400).json({ ok: false, error: 'INVALID_TEAM_COUNT' });
  }
  if (activeCount === 0) {
    return res.status(409).json({ ok: false, error: 'NO_PARTICIPANTS' });
  }
  if (teamCount > activeCount) {
    return res.status(400).json({ ok: false, error: 'TOO_MANY_TEAMS' });
  }

  assignRandomTeams(event.id, teamCount);
  const io = req.app.get('io');
  if (io) broadcastScoreboard(io, event.code, event.id);

  const participants = listParticipantsByEvent(event.id).map(toPublicParticipant);
  const teamScores = listTeamScores(event.id);
  res.json({ ok: true, participants, teamScores });
});
