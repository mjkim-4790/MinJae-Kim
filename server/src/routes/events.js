import { Router } from 'express';

import { requireOperator } from '../auth/middleware.js';
import {
  createEvent,
  getEventById,
  listEventsByOperator,
  setEventStatus,
} from '../db/events.js';
import { listParticipantsByEvent } from '../db/participants.js';
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

  const participants = listParticipantsByEvent(event.id).map((p) => ({
    id: p.id,
    nickname: p.nickname,
    teamId: p.team_id,
    score: p.score,
    status: p.status,
    joinedAt: p.joined_at,
  }));

  res.json({ ok: true, event: toPublicEvent(event), participants });
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
