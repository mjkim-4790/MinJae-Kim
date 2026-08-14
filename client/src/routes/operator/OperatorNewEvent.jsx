import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../../lib/api.js';

const ERROR_MESSAGE = {
  NAME_REQUIRED: '이벤트명을 입력하세요',
  UNSUPPORTED_LOGO_TYPE: '지원하지 않는 이미지 형식입니다 (PNG/JPEG/WEBP/GIF)',
  LOGO_TOO_LARGE: '로고 파일이 너무 큽니다 (최대 5MB)',
};

export default function OperatorNewEvent() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [mode, setMode] = useState('individual');
  const [maxParticipants, setMaxParticipants] = useState(50);
  const [scheduledAt, setScheduledAt] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set('name', name.trim());
    formData.set('mode', mode);
    formData.set('maxParticipants', String(maxParticipants));
    if (scheduledAt) formData.set('scheduledAt', new Date(scheduledAt).toISOString());
    if (logoFile) formData.set('logo', logoFile);

    try {
      const res = await api.createEvent(formData);
      navigate(`/operator/events/${res.event.id}`, { replace: true });
    } catch (err) {
      setError(ERROR_MESSAGE[err.code] ?? '이벤트 개설에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page">
      <h1 className="title">새 이벤트 개설</h1>

      <form className="stack" style={{ maxWidth: 420 }} onSubmit={submit}>
        <label className="field">
          <span className="field__label">이벤트명</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 2026 송년회"
            required
          />
        </label>

        <label className="field">
          <span className="field__label">모드</span>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="individual">개인전</option>
            <option value="team">팀전</option>
          </select>
        </label>

        <label className="field">
          <span className="field__label">최대 인원 (시험 단계 권장: 50명 이하)</span>
          <input
            className="input"
            type="number"
            min={1}
            max={500}
            value={maxParticipants}
            onChange={(e) => setMaxParticipants(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field__label">일시 (선택)</span>
          <input
            className="input"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field__label">로고 이미지 (선택, 대형 스크린 대기화면용)</span>
          <input
            className="input"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {error && <p className="error-text">{error}</p>}

        <button className="button" type="submit" disabled={submitting}>
          {submitting ? '만드는 중…' : '이벤트 만들기'}
        </button>
      </form>
    </main>
  );
}
