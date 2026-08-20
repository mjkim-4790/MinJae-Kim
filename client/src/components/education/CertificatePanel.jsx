import { useState } from 'react';
import { motion } from 'motion/react';

import { springDrawer, springTap } from '../../lib/motionPresets.js';

/** 자격증 추가/수정 슬라이드 패널 — 취미 입력 패널과 같은 자리·같은 톤. */
export default function CertificatePanel({ initial, onSave, onClose, onDelete, busy, error }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [detail, setDetail] = useState(initial?.detail ?? '');
  const [achieved, setAchieved] = useState(initial?.achieved ?? false);

  const canSave = name.trim().length > 0;

  return (
    <motion.div className="hobby-panel" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={springDrawer}>
      <span className="screen-title hobby-panel__title">{initial ? '자격증 수정' : '새 자격증 추가'}</span>

      <label className="panel-field">
        <span className="panel-field__label">자격증 이름</span>
        <input className="input panel-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </label>

      <label className="panel-field" style={{ flex: 1 }}>
        <span className="panel-field__label">세부내용</span>
        <textarea
          className="panel-textarea"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="필기/실기 점수, 접수 일정 등 자유롭게"
          maxLength={1000}
        />
      </label>

      <div className="visited-toggle">
        <button
          type="button"
          className={`visited-toggle__opt${!achieved ? ' visited-toggle__opt--active' : ''}`}
          onClick={() => setAchieved(false)}
        >
          준비 중
        </button>
        <button
          type="button"
          className={`visited-toggle__opt${achieved ? ' visited-toggle__opt--active' : ''}`}
          onClick={() => setAchieved(true)}
        >
          🎉 취득 완료
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="hobby-panel__actions">
        {onDelete && (
          <motion.button
            type="button"
            className="button button--danger"
            onClick={onDelete}
            disabled={busy}
            whileTap={{ scale: 0.96 }}
            transition={springTap}
          >
            삭제
          </motion.button>
        )}
        <button
          className="panel-submit"
          disabled={busy || !canSave}
          onClick={() => onSave({ name: name.trim(), detail: detail.trim(), achieved })}
        >
          {busy ? '저장하는 중…' : '저장'}
        </button>
      </div>

      <button type="button" className="hobby-panel__close" onClick={onClose} aria-label="닫기">
        ✕
      </button>
    </motion.div>
  );
}
