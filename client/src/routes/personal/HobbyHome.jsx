import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import PersonalLayout from '../../components/personal/PersonalLayout.jsx';
import { api } from '../../lib/api.js';
import { HOBBY_CATEGORIES } from '../../lib/hobby.js';

// 취미 홈 — 박스 없이 선으로만 구분된 6개 카테고리 (사용자 참고 사진: iPhone 설정 목록).
export default function HobbyHome() {
  const [counts, setCounts] = useState({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(HOBBY_CATEGORIES.map((c) => api.listHobbyItems(c.id).then((res) => [c.id, res.items.length])))
      .then((pairs) => {
        if (!cancelled) setCounts(Object.fromEntries(pairs));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PersonalLayout>
      <main className="page personal-home">
        <header className="personal-home__header">
          <h1 className="personal-home__name" style={{ fontSize: 22 }}>
            취미
          </h1>
        </header>

        <ul className="line-list">
          {HOBBY_CATEGORIES.map((c) => (
            <li key={c.id}>
              <Link to={`/home/hobby/${c.id}`} className="line-list__row">
                <span className="line-list__icon" aria-hidden="true">
                  {c.icon}
                </span>
                <span className="line-list__label">{c.label}</span>
                <span className="line-list__count">
                  {counts[c.id] != null ? `${counts[c.id]}${c.unit}` : ''}
                </span>
                <span className="line-list__chevron" aria-hidden="true">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </PersonalLayout>
  );
}
