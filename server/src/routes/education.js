import { Router } from 'express';

import { requireOperator } from '../auth/middleware.js';
import {
  deleteEducationScore,
  listEducationScoresByLevel,
  listEducationTargetsByLevel,
  upsertEducationScore,
  upsertEducationTarget,
} from '../db/educationScores.js';
import {
  createCertificate,
  deleteCertificate,
  getCertificate,
  listCertificates,
  updateCertificate,
} from '../db/certificates.js';

export const educationRouter = Router();
educationRouter.use(requireOperator);

const LEVELS = new Set(['elementary', 'middle', 'high', 'university']);
const GRADE_COUNT = { elementary: 6, middle: 3, high: 3, university: 4 };
const EXAM_TYPES = new Set(['midterm', 'final']);
// 대학생은 학점(보통 0~4.5), 그 외는 점수(0~100) — 같은 테이블을 쓰지만 범위만 다르다.
const SCORE_RANGE = { elementary: 100, middle: 100, high: 100, university: 4.5 };

function buildGradeTree(level, scores, targets) {
  const targetMap = new Map(
    targets.map((t) => [`${t.grade}-${t.semester}-${t.exam_type}`, t.target]),
  );

  const grades = [];
  for (let grade = 1; grade <= GRADE_COUNT[level]; grade += 1) {
    const semesters = [1, 2].map((semester) => {
      const exams = ['midterm', 'final'].map((examType) => {
        const subjects = scores
          .filter((s) => s.grade === grade && s.semester === semester && s.exam_type === examType)
          .map((s) => ({ subject: s.subject, score: s.score }));
        const average = subjects.length
          ? subjects.reduce((sum, s) => sum + s.score, 0) / subjects.length
          : null;
        const target = targetMap.get(`${grade}-${semester}-${examType}`) ?? null;
        return {
          examType,
          target,
          subjects,
          average: average === null ? null : Math.round(average * 10) / 10,
          achieved: average !== null && target !== null && average >= target,
        };
      });
      return { semester, exams };
    });
    grades.push({ grade, semesters });
  }
  return grades;
}

educationRouter.get('/scores', (req, res) => {
  const level = String(req.query.level ?? '');
  if (!LEVELS.has(level)) return res.status(400).json({ ok: false, error: 'INVALID_LEVEL' });

  const scores = listEducationScoresByLevel(req.operator.id, level);
  const targets = listEducationTargetsByLevel(req.operator.id, level);
  res.json({ ok: true, level, maxScore: SCORE_RANGE[level], grades: buildGradeTree(level, scores, targets) });
});

educationRouter.put('/scores', (req, res) => {
  const level = String(req.body?.level ?? '');
  const grade = Number(req.body?.grade);
  const semester = Number(req.body?.semester);
  const examType = String(req.body?.examType ?? '');
  const subject = String(req.body?.subject ?? '').trim().slice(0, 20);
  const score = Number(req.body?.score);

  if (!LEVELS.has(level)) return res.status(400).json({ ok: false, error: 'INVALID_LEVEL' });
  if (!Number.isInteger(grade) || grade < 1 || grade > GRADE_COUNT[level]) {
    return res.status(400).json({ ok: false, error: 'INVALID_GRADE' });
  }
  if (semester !== 1 && semester !== 2) return res.status(400).json({ ok: false, error: 'INVALID_SEMESTER' });
  if (!EXAM_TYPES.has(examType)) return res.status(400).json({ ok: false, error: 'INVALID_EXAM_TYPE' });
  if (!subject) return res.status(400).json({ ok: false, error: 'SUBJECT_REQUIRED' });
  if (!Number.isFinite(score) || score < 0 || score > SCORE_RANGE[level]) {
    return res.status(400).json({ ok: false, error: 'INVALID_SCORE' });
  }

  upsertEducationScore({ operatorId: req.operator.id, level, grade, semester, examType, subject, score });
  res.json({ ok: true });
});

educationRouter.delete('/scores', (req, res) => {
  const level = String(req.body?.level ?? '');
  const grade = Number(req.body?.grade);
  const semester = Number(req.body?.semester);
  const examType = String(req.body?.examType ?? '');
  const subject = String(req.body?.subject ?? '').trim();

  if (!LEVELS.has(level) || !subject) return res.status(400).json({ ok: false, error: 'INVALID_REQUEST' });

  const ok = deleteEducationScore({ operatorId: req.operator.id, level, grade, semester, examType, subject });
  if (!ok) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
  res.json({ ok: true });
});

educationRouter.put('/target', (req, res) => {
  const level = String(req.body?.level ?? '');
  const grade = Number(req.body?.grade);
  const semester = Number(req.body?.semester);
  const examType = String(req.body?.examType ?? '');
  const target = Number(req.body?.target);

  if (!LEVELS.has(level)) return res.status(400).json({ ok: false, error: 'INVALID_LEVEL' });
  if (!Number.isInteger(grade) || grade < 1 || grade > GRADE_COUNT[level]) {
    return res.status(400).json({ ok: false, error: 'INVALID_GRADE' });
  }
  if (semester !== 1 && semester !== 2) return res.status(400).json({ ok: false, error: 'INVALID_SEMESTER' });
  if (!EXAM_TYPES.has(examType)) return res.status(400).json({ ok: false, error: 'INVALID_EXAM_TYPE' });
  if (!Number.isFinite(target) || target < 0 || target > SCORE_RANGE[level]) {
    return res.status(400).json({ ok: false, error: 'INVALID_TARGET' });
  }

  upsertEducationTarget({ operatorId: req.operator.id, level, grade, semester, examType, target });
  res.json({ ok: true });
});

// 자격증 — 취미 리스트업과 같은 결의 CRUD.
function toPublicCert(c) {
  return { id: c.id, name: c.name, detail: c.detail, achieved: Boolean(c.achieved), updatedAt: c.updated_at };
}

educationRouter.get('/certificates', (req, res) => {
  res.json({ ok: true, items: listCertificates(req.operator.id).map(toPublicCert) });
});

educationRouter.post('/certificates', (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
  const detail = String(req.body?.detail ?? '').trim().slice(0, 1000);
  const achieved = req.body?.achieved ? 1 : 0;

  const item = createCertificate({ operatorId: req.operator.id, name, detail, achieved });
  res.json({ ok: true, item: toPublicCert(item) });
});

educationRouter.put('/certificates/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!getCertificate(id, req.operator.id)) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

  const name = String(req.body?.name ?? '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
  const detail = String(req.body?.detail ?? '').trim().slice(0, 1000);
  const achieved = req.body?.achieved ? 1 : 0;

  const item = updateCertificate({ id, operatorId: req.operator.id, name, detail, achieved });
  res.json({ ok: true, item: toPublicCert(item) });
});

educationRouter.delete('/certificates/:id', (req, res) => {
  const ok = deleteCertificate(Number(req.params.id), req.operator.id);
  if (!ok) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
  res.json({ ok: true });
});
