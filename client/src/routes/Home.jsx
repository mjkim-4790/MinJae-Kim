import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// 홈은 참여자의 백업 입장 경로다 (설계문서 §5.2 — 기본은 QR 직접 입장).
export default function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');

  const submit = (event) => {
    event.preventDefault();
    const value = code.trim();
    if (value.length !== 4) return;
    navigate(`/join/${value}`);
  };

  return (
    <main className="page page--center">
      <div className="stack">
        <h1 className="title">레크레이션</h1>
        <p className="subtitle">참여 코드 4자리를 입력하세요</p>

        <form className="stack" onSubmit={submit}>
          <input
            className="input input--code"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="0000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            aria-label="참여 코드 4자리"
          />
          <button className="button" type="submit" disabled={code.length !== 4}>
            입장하기
          </button>
        </form>

        <nav className="devlinks">
          <span className="devlinks__title">개발용 바로가기</span>
          <Link to="/operator">운영자 화면</Link>
          <Link to="/screen/0000">대형 스크린 (코드 0000)</Link>
          <Link to="/join/0000">참여자 화면 (코드 0000)</Link>
        </nav>
      </div>
    </main>
  );
}
