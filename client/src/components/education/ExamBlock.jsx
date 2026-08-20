import { useState } from 'react';

import { api } from '../../lib/api.js';
import { EXAM_LABELS } from '../../lib/education.js';

/**
 * 학년 하나 안의 시험 칸 하나(예: 1학기 중간고사) — 과목별 점수를 넣고 빼고, 시험
 * 하나에 목표를 하나 설정한다(사용자 결정 — 과목별이 아니라 시험마다 개별 목표).
 * 평균이 목표를 넘으면 골드로 하이라이트된다.
 */
export default function ExamBlock({ level, grade, semester, examType, exam, unit, scoreLabel, maxScore, onChanged }) {
  const [newSubject, setNewSubject] = useState('');
  const [newScore, setNewScore] = useState('');
  const [targetInput, setTargetInput] = useState(exam.target ?? '');
  const [busy, setBusy] = useState(false);

  const addSubject = async () => {
    const subject = newSubject.trim();
    const score = Number(newScore);
    if (!subject || !Number.isFinite(score)) return;
    setBusy(true);
    try {
      await api.saveEducationScore({ level, grade, semester, examType, subject, score });
      setNewSubject('');
      setNewScore('');
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const updateScore = async (subject, score) => {
    if (!Number.isFinite(score)) return;
    await api.saveEducationScore({ level, grade, semester, examType, subject, score });
    onChanged();
  };

  const removeSubject = async (subject) => {
    await api.deleteEducationScore({ level, grade, semester, examType, subject });
    onChanged();
  };

  const saveTarget = async () => {
    const target = Number(targetInput);
    if (!Number.isFinite(target)) return;
    await api.saveEducationTarget({ level, grade, semester, examType, target });
    onChanged();
  };

  return (
    <div className={`exam-cell${exam.achieved ? ' exam-cell--goal-hit' : ''}`}>
      <span className="exam-cell__label">{EXAM_LABELS[examType]}</span>

      <ul className="exam-subject-list">
        {exam.subjects.map((s) => (
          <li key={s.subject} className="exam-subject-row">
            <span className="exam-subject-row__name">{s.subject}</span>
            <input
              type="number"
              className="exam-subject-row__score"
              defaultValue={s.score}
              onBlur={(e) => updateScore(s.subject, Number(e.target.value))}
              step="0.1"
              min={0}
              max={maxScore}
            />
            <button type="button" className="exam-subject-row__remove" onClick={() => removeSubject(s.subject)} aria-label="삭제">
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="exam-subject-add">
        <input
          className="exam-subject-add__name"
          placeholder="과목"
          value={newSubject}
          onChange={(e) => setNewSubject(e.target.value)}
          maxLength={20}
        />
        <input
          type="number"
          className="exam-subject-add__score"
          placeholder={scoreLabel}
          value={newScore}
          onChange={(e) => setNewScore(e.target.value)}
          step="0.1"
          min={0}
          max={maxScore}
        />
        <button type="button" className="exam-subject-add__btn" disabled={busy} onClick={addSubject}>
          +
        </button>
      </div>

      {exam.average !== null && (
        <div className="exam-cell__score-row">
          <span className="exam-cell__score">{exam.average}</span>
          <span className="exam-cell__unit">{unit} 평균</span>
        </div>
      )}

      <div className="exam-cell__target-row">
        <input
          type="number"
          className="exam-cell__target-input"
          placeholder="목표"
          value={targetInput}
          onChange={(e) => setTargetInput(e.target.value)}
          onBlur={saveTarget}
          step="0.1"
          min={0}
          max={maxScore}
        />
        {exam.achieved ? (
          <span className="exam-cell__badge">🎉 목표 달성!</span>
        ) : exam.target !== null ? (
          <span className="exam-cell__goal">목표 {exam.target}{unit}</span>
        ) : null}
      </div>
    </div>
  );
}
