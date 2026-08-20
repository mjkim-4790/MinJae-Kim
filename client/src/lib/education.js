// 교육 5갈래 공용 메타데이터. university 만 점수 대신 학점(4.5 만점)을 쓴다.
export const EDUCATION_LEVELS = [
  { id: 'elementary', label: '초등학생', icon: '🧒', gradeCount: 6, maxScore: 100, unit: '점', scoreLabel: '점수' },
  { id: 'middle', label: '중학생', icon: '🎒', gradeCount: 3, maxScore: 100, unit: '점', scoreLabel: '점수' },
  { id: 'high', label: '고등학생', icon: '📘', gradeCount: 3, maxScore: 100, unit: '점', scoreLabel: '점수' },
  { id: 'university', label: '대학생', icon: '🎓', gradeCount: 4, maxScore: 4.5, unit: '', scoreLabel: '학점' },
];

export function educationLevelById(id) {
  return EDUCATION_LEVELS.find((l) => l.id === id) ?? null;
}

export const EXAM_LABELS = {
  midterm: '중간고사',
  final: '기말고사',
};

export const DEFAULT_SUBJECTS = ['국어', '수학', '영어'];
