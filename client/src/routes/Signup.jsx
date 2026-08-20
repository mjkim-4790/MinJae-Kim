import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import friendsLogo from '../assets/friends-logo.png';
import { useAuth } from '../hooks/useAuth.jsx';

const ERROR_MESSAGE = {
  FIELDS_REQUIRED: '이메일·비밀번호·이름을 모두 입력하세요',
  PASSWORD_TOO_SHORT: '비밀번호는 8자 이상이어야 합니다',
  INVALID_ACCOUNT_TYPE: '계정 유형을 선택하세요',
  EMAIL_TAKEN: '이미 가입된 이메일입니다',
};

const ACCOUNT_TYPES = [
  {
    id: 'personal',
    label: '일반인 전용',
    desc: '일기·취미·교육을 기록하고, 직접 게임을 만들어 사람들을 초대해요',
  },
  {
    id: 'mc',
    label: 'MC 전용',
    desc: '행사 진행을 전담해요 — 참여자 관리와 게임 운영에 집중된 화면',
  },
];

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // 다른 페이지에서 "일반인 전용" 등으로 들어오다 로그인이 필요해 여기로 온 경우,
  // 그 의도에 맞는 계정 유형을 기본 선택해둔다 (§7 공간 일관성 — 온 길과 이어지게).
  const suggestedType = location.state?.from?.startsWith('/operator') ? 'mc' : 'personal';

  const [accountType, setAccountType] = useState(suggestedType);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from ?? (accountType === 'mc' ? '/operator' : '/home');

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const operator = await signup({ email, password, name, accountType });
      navigate(location.state?.from ?? (operator.accountType === 'mc' ? '/operator' : '/home'), {
        replace: true,
      });
    } catch (err) {
      setError(ERROR_MESSAGE[err.code] ?? '회원가입에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page page--entry">
      <form className="entry" onSubmit={submit}>
        <img src={friendsLogo} alt="Friends" className="entry__logo entry__logo--login" />
        <h1 className="sr-only">회원가입</h1>

        <div className="account-type-grid">
          {ACCOUNT_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`account-type-tile${accountType === t.id ? ' account-type-tile--active' : ''}`}
              onClick={() => setAccountType(t.id)}
            >
              <span className="account-type-tile__label">{t.label}</span>
              <span className="account-type-tile__desc">{t.desc}</span>
            </button>
          ))}
        </div>

        <input
          className="input"
          placeholder="이름"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="input"
          type="email"
          placeholder="이메일"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="비밀번호 (8자 이상)"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <div className="operator-login__actions">
          <button className="button operator-login__submit" type="submit" disabled={submitting}>
            {submitting ? '가입하는 중…' : '가입하고 시작하기'}
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="operator-login__aux">
          <span>이미 계정이 있으신가요?</span>
          <span className="operator-login__sep" aria-hidden="true" />
          <Link className="operator-login__aux-link" to="/operator/login" state={{ from }}>
            로그인
          </Link>
        </div>
      </form>
    </main>
  );
}
