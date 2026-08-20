import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import ExamBlock from '../../components/education/ExamBlock.jsx';
import PersonalLayout from '../../components/personal/PersonalLayout.jsx';
import { api } from '../../lib/api.js';
import { educationLevelById } from '../../lib/education.js';

function gradeAverage(gradeData) {
  const allAverages = gradeData.semesters.flatMap((s) => s.exams.map((e) => e.average)).filter((a) => a !== null);
  if (allAverages.length === 0) return null;
  return Math.round((allAverages.reduce((sum, a) => sum + a, 0) / allAverages.length) * 10) / 10;
}

export default function EducationLevel() {
  const { level: levelId } = useParams();
  const level = educationLevelById(levelId);

  const [grades, setGrades] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

  const load = () => {
    if (!level) return;
    api
      .getEducationScores(level.id)
      .then((res) => setGrades(res.grades))
      .catch(() => {});
  };

  useEffect(load, [levelId]);

  if (!level) return <Navigate to="/home/education" replace />;

  const toggle = (grade) => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(grade)) next.delete(grade);
      else next.add(grade);
      return next;
    });
  };

  return (
    <PersonalLayout>
      <main className="page education-level">
        <div className="screen-topbar">
          <Link to="/home/education" className="back-chip" aria-label="교육 목록으로">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <span className="screen-title">{level.label}</span>
        </div>

        {!grades && <p className="subtitle">불러오는 중…</p>}

        <div className="year-list">
          {grades?.map((gradeData) => {
            const isOpen = expanded.has(gradeData.grade);
            const avg = gradeAverage(gradeData);
            return (
              <div key={gradeData.grade} className="year-card">
                <button type="button" className="year-card__head" onClick={() => toggle(gradeData.grade)}>
                  <span className="year-card__title">{gradeData.grade}학년</span>
                  <span className="year-card__avg">{avg !== null ? `평균 ${avg}${level.unit}` : '기록 없음'}</span>
                  <span className="year-card__chevron">{isOpen ? '︿' : '﹀'}</span>
                </button>
                {isOpen && (
                  <div className="semester-list">
                    {gradeData.semesters.map((semData) => (
                      <div key={semData.semester} className="semester-block">
                        <span className="semester-block__label">{semData.semester}학기</span>
                        <div className="exam-grid">
                          {semData.exams.map((exam) => (
                            <ExamBlock
                              key={exam.examType}
                              level={level.id}
                              grade={gradeData.grade}
                              semester={semData.semester}
                              examType={exam.examType}
                              exam={exam}
                              unit={level.unit}
                              scoreLabel={level.scoreLabel}
                              maxScore={level.maxScore}
                              onChanged={load}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </PersonalLayout>
  );
}
