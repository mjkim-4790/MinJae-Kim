import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import PersonalLayout from '../../components/personal/PersonalLayout.jsx';
import { api } from '../../lib/api.js';
import { EDUCATION_LEVELS } from '../../lib/education.js';

// 교육 홈 — 초/중/고/대학생/자격증 5갈래, 선으로만 구분 (취미 홈과 같은 패턴).
export default function EducationHome() {
  const [certCount, setCertCount] = useState(null);

  useEffect(() => {
    api
      .listCertificates()
      .then((res) => setCertCount(res.items.length))
      .catch(() => {});
  }, []);

  return (
    <PersonalLayout>
      <main className="page personal-home">
        <header className="personal-home__header">
          <h1 className="personal-home__name" style={{ fontSize: 22 }}>
            교육
          </h1>
        </header>

        <ul className="line-list">
          {EDUCATION_LEVELS.map((l) => (
            <li key={l.id}>
              <Link to={`/home/education/${l.id}`} className="line-list__row">
                <span className="line-list__icon" aria-hidden="true">
                  {l.icon}
                </span>
                <span className="line-list__label">{l.label}</span>
                <span className="line-list__count">{l.gradeCount}개 학년</span>
                <span className="line-list__chevron" aria-hidden="true">
                  ›
                </span>
              </Link>
            </li>
          ))}
          <li>
            <Link to="/home/education/certificates" className="line-list__row">
              <span className="line-list__icon" aria-hidden="true">
                📜
              </span>
              <span className="line-list__label">자격증</span>
              <span className="line-list__count">{certCount != null ? `${certCount}건` : ''}</span>
              <span className="line-list__chevron" aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
        </ul>
      </main>
    </PersonalLayout>
  );
}
