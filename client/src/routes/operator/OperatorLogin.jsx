import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import friendsLogo from '../../assets/friends-logo.png';
import { useAuth } from '../../hooks/useAuth.jsx';

const ERROR_MESSAGE = {
  EMAIL_PASSWORD_REQUIRED: '이메일과 비밀번호를 입력하세요',
  INVALID_CREDENTIALS: '이메일 또는 비밀번호가 올바르지 않습니다',
};

export default function OperatorLogin() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from;

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const operator = await login(email, password);
      // 특정 화면에 들어가려다 로그인이 필요해 여기로 왔으면 그 화면으로, 아니면 계정
      // 유형에 맞는 기본 홈으로 (MC → 이벤트 목록, 일반인 → 새 홈).
      navigate(from ?? (operator.accountType === 'personal' ? '/home' : '/operator'), {
        replace: true,
      });
    } catch (err) {
      setError(ERROR_MESSAGE[err.code] ?? '로그인에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page page--entry">
      <form className="entry" onSubmit={submit}>
        <img src={friendsLogo} alt="Friends" className="entry__logo entry__logo--login" />
        {/* 로고가 제목을 대신하지만, 스크린리더에는 여전히 페이지 제목이 들려야 한다 */}
        <h1 className="sr-only">운영자 로그인</h1>

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
          placeholder="비밀번호"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div className="operator-login__actions">
          <button className="button operator-login__submit" type="submit" disabled={submitting}>
            {submitting ? '확인 중…' : '다음'}
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}

        {/* 비밀번호 찾기는 아직 없어서 자리만 잡아둔다 */}
        <div className="operator-login__aux">
          <Link className="operator-login__aux-link" to="/signup" state={{ from }}>
            회원가입
          </Link>
          <span className="operator-login__sep" aria-hidden="true" />
          <span className="operator-login__aux-link">이메일 · 비밀번호 찾기</span>
        </div>
      </form>
    </main>
  );
}
