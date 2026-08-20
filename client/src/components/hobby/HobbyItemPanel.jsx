import { useState } from 'react';
import { motion } from 'motion/react';

import CrayonStars from './CrayonStars.jsx';
import { SIDO_NAMES } from '../../lib/hobby.js';
import { springDrawer, springTap } from '../../lib/motionPresets.js';

const NAME_LABEL = {
  cafe: '카페 이름',
  restaurant: '식당 이름',
  travel: '장소 이름',
  book: '책 제목',
  music: '곡 제목',
  movie: '영화 제목',
};

/**
 * "+"를 누르면 오른쪽에서 슬라이드로 나오는 흰 배경 입력 화면 (모든 취미 카테고리
 * 공용). 위치/영업시간은 hasLocation 카테고리만, 여행장소는 위치가 자유 텍스트가
 * 아니라 지도 매칭을 위한 17개 시/도 선택 + 방문 여부·색상 토글이 추가로 붙는다.
 */
export default function HobbyItemPanel({ category, initial, onSave, onClose, onDelete, busy, error }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [location, setLocation] = useState(initial?.location ?? (category.isTravel ? SIDO_NAMES[0] : ''));
  const [hours, setHours] = useState(initial?.hours ?? '');
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [review, setReview] = useState(initial?.review ?? '');
  const [visited, setVisited] = useState(initial?.visited ?? false);
  const [visitedColor, setVisitedColor] = useState(initial?.visitedColor ?? 'pink');

  const canSave = name.trim().length > 0 && (!category.isTravel || location);

  const submit = () => {
    onSave({
      name: name.trim(),
      location: category.hasLocation ? location : null,
      hours: category.hasLocation ? hours.trim() : null,
      rating,
      review: review.trim(),
      visited: category.isTravel ? visited : undefined,
      visitedColor: category.isTravel && visited ? visitedColor : undefined,
    });
  };

  return (
    <motion.div
      className="hobby-panel"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={springDrawer}
    >
      <span className="screen-title hobby-panel__title">
        {initial ? `${category.label} 수정` : `새 ${category.label} 추가`}
      </span>

      <label className="panel-field">
        <span className="panel-field__label">{NAME_LABEL[category.id]}</span>
        <input className="input panel-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </label>

      {category.hasLocation && category.isTravel && (
        <label className="panel-field">
          <span className="panel-field__label">지역</span>
          <select className="input panel-input" value={location} onChange={(e) => setLocation(e.target.value)}>
            {SIDO_NAMES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}

      {category.hasLocation && !category.isTravel && (
        <label className="panel-field">
          <span className="panel-field__label">위치</span>
          <input
            className="input panel-input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="예: 서울 성동구"
            maxLength={60}
          />
        </label>
      )}

      {category.hasLocation && (
        <label className="panel-field">
          <span className="panel-field__label">영업시간</span>
          <input
            className="input panel-input"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="예: 10:00–21:00"
            maxLength={40}
          />
        </label>
      )}

      {category.isTravel && (
        <div className="panel-field">
          <span className="panel-field__label">방문 여부</span>
          <div className="visited-toggle">
            <button
              type="button"
              className={`visited-toggle__opt${!visited ? ' visited-toggle__opt--active' : ''}`}
              onClick={() => setVisited(false)}
            >
              가보고 싶어요
            </button>
            <button
              type="button"
              className={`visited-toggle__opt${visited ? ' visited-toggle__opt--active' : ''}`}
              onClick={() => setVisited(true)}
            >
              다녀왔어요
            </button>
          </div>
          {visited && (
            <div className="visited-color-pick">
              <button
                type="button"
                className={`visited-color-pick__dot visited-color-pick__dot--pink${visitedColor === 'pink' ? ' visited-color-pick__dot--active' : ''}`}
                onClick={() => setVisitedColor('pink')}
                aria-label="분홍"
              />
              <button
                type="button"
                className={`visited-color-pick__dot visited-color-pick__dot--blue${visitedColor === 'blue' ? ' visited-color-pick__dot--active' : ''}`}
                onClick={() => setVisitedColor('blue')}
                aria-label="파랑"
              />
            </div>
          )}
        </div>
      )}

      <div className="panel-field">
        <span className="panel-field__label">별점</span>
        <CrayonStars value={rating} onChange={setRating} />
      </div>

      <label className="panel-field" style={{ flex: 1 }}>
        <span className="panel-field__label">다녀온 후 짧은 후기</span>
        <textarea
          className="panel-textarea"
          value={review}
          onChange={(e) => setReview(e.target.value)}
          placeholder="아직 안 가봤다면 기대되는 점을 적어도 좋아요"
          maxLength={1000}
        />
      </label>

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
        <button className="panel-submit" disabled={busy || !canSave} onClick={submit}>
          {busy ? '저장하는 중…' : '저장'}
        </button>
      </div>

      <button type="button" className="hobby-panel__close" onClick={onClose} aria-label="닫기">
        ✕
      </button>
    </motion.div>
  );
}
