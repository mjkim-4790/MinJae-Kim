import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import friendsLogo from '../assets/friends-logo.png';
import AppMenu from '../components/AppMenu.jsx';

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
    <main className="page page--entry">
      <AppMenu />

      <div className="entry">
        {/* 로고가 제목을 대신하지만, 스크린리더에는 여전히 페이지 제목이 들려야 한다 */}
        <img src={friendsLogo} alt="Friends" className="entry__logo entry__logo--home" />
        <h1 className="sr-only">레크레이션 참여</h1>

        <form className="stack" onSubmit={submit}>
          <p className="subtitle entry__hint">참여 코드 4자리를 입력하세요</p>
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
      </div>
    </main>
  );
}
