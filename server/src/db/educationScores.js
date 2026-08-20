import db from './index.js';

const upsertScoreStmt = db.prepare(`
  INSERT INTO education_scores (operator_id, level, grade, semester, exam_type, subject, score, updated_at)
  VALUES (@operatorId, @level, @grade, @semester, @examType, @subject, @score, datetime('now'))
  ON CONFLICT(operator_id, level, grade, semester, exam_type, subject) DO UPDATE SET
    score = excluded.score,
    updated_at = excluded.updated_at
`);
const deleteScoreStmt = db.prepare(`
  DELETE FROM education_scores
  WHERE operator_id = @operatorId AND level = @level AND grade = @grade
    AND semester = @semester AND exam_type = @examType AND subject = @subject
`);
const scoresByLevelStmt = db.prepare(
  `SELECT * FROM education_scores WHERE operator_id = ? AND level = ? ORDER BY grade, semester, exam_type, id`,
);

const upsertTargetStmt = db.prepare(`
  INSERT INTO education_exam_targets (operator_id, level, grade, semester, exam_type, target)
  VALUES (@operatorId, @level, @grade, @semester, @examType, @target)
  ON CONFLICT(operator_id, level, grade, semester, exam_type) DO UPDATE SET target = excluded.target
`);
const targetsByLevelStmt = db.prepare(
  `SELECT * FROM education_exam_targets WHERE operator_id = ? AND level = ?`,
);

export function upsertEducationScore(entry) {
  upsertScoreStmt.run(entry);
}

export function deleteEducationScore(entry) {
  return deleteScoreStmt.run(entry).changes > 0;
}

export function listEducationScoresByLevel(operatorId, level) {
  return scoresByLevelStmt.all(operatorId, level);
}

export function upsertEducationTarget(entry) {
  upsertTargetStmt.run(entry);
}

export function listEducationTargetsByLevel(operatorId, level) {
  return targetsByLevelStmt.all(operatorId, level);
}
