import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

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
      <form className="stack" style={{ width: 'min(360px, 100%)' }} onSubmit={submit}>
        <h1 className="title">운영자 로그인</h1>
        <p className="subtitle">
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
        <input
          className="input"
          type="password"
          placeholder="비밀번호"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="error-text">{error}</p>}

        <button className="button" type="submit" disabled={submitting}>
          {submitting ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </main>
  );
}
