import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

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

  const from = location.state?.from ?? '/operator';

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(ERROR_MESSAGE[err.code] ?? '로그인에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page page--center">
      <form className="stack operator-login" style={{ width: 'min(360px, 100%)' }} onSubmit={submit}>
        <img src={friendsLogo} alt="Friends" className="operator-login__logo" />
        {/* 로고가 제목을 대신하지만, 스크린리더에는 여전히 페이지 제목이 들려야 한다 */}
        <h1 className="sr-only">운영자 로그인</h1>
        <p className="subtitle operator-login__subtitle">
          계정은 개발자가 생성해 전달합니다. 계정이 없다면 담당자에게 문의하세요.
        </p>

        <input
          className="input"
          type="email"
          placeholder="이메일"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <div className="operator-login__pw-row">
          <input
            className="input"
            type="password"
            placeholder="비밀번호"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="button operator-login__submit" type="submit" disabled={submitting}>
            {submitting ? '로그인 중…' : '로그인'}
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}

        {/* 회원가입 / 비밀번호 찾기 기능은 아직 없어서 자리만 잡아둔다 (§9 결정과 별개 —
            추후 회원가입 기능을 만들면 여기를 실제 링크로 바꾼다) */}
        <div className="operator-login__aux">
          <span className="operator-login__aux-link">회원가입</span>
          <span className="operator-login__sep" aria-hidden="true" />
          <span className="operator-login__aux-link">이메일 · 비밀번호 찾기</span>
        </div>
      </form>
    </main>
  );
}
