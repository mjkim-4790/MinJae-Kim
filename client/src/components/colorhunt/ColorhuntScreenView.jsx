import { AnimatePresence, motion } from 'motion/react';

import { springPop, springSettle } from '../../lib/motionPresets.js';

/**
 * 사람이 늘면 타일을 줄인다.
 *
 * 고정 크기로 뒀더니 50명(이 플랫폼의 목표 규모)에서 그리드가 728px 이 되어 화면 아래로
 * 잘렸다. 대형 스크린은 아무도 스크롤할 수 없으므로 잘리는 순간 그 사람들은 게임에서
 * 사라진 것과 같다. 그래서 개수에 맞춰 크기를 낮춰 항상 한 화면에 담는다.
 */
function tileMetrics(n) {
  if (n <= 12) return { size: 'clamp(90px, 9vw, 150px)', name: 'clamp(13px, 1.3vw, 20px)' };
  if (n <= 24) return { size: 'clamp(74px, 7vw, 116px)', name: 'clamp(12px, 1.1vw, 17px)' };
  if (n <= 40) return { size: 'clamp(60px, 5.5vw, 92px)', name: 'clamp(11px, 0.95vw, 15px)' };
  return { size: 'clamp(46px, 4.4vw, 74px)', name: 'clamp(9px, 0.8vw, 13px)' };
}

// 대형화면 — 참여자가 찾아온 색이 타일로 깔린다.
//
// 사진은 여기 오지 않는다. 서버에 애초에 없고, 설령 있더라도 큰 화면에 띄우지 않는다.
// 아이가 섞인 행사에서 얼굴이 프로젝터에 뜨는 경로는 만들지 않는다는 게 전제다.
// 그래서 화면에 나오는 건 색과 닉네임뿐이고, 그것만으로도 충분히 볼 만하다 —
// 사람들이 각자 다른 물건을 들고 와서 같은 '주황'이 스무 가지로 갈리는 게 이 게임의 그림이다.
export default function ColorhuntScreenView({ state }) {
  const hunting = state.status === 'hunting';
  const target = state.target;
  const tiles = state.tiles ?? [];

  if (state.status === 'ended') {
    return (
      <div className="screen__center">
        <p className="screen__eyebrow">색깔 사냥 — 종료</p>
        <motion.p
          className="mg-screen__winner"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springPop}
        >
          🎨 {state.ranking?.[0]?.nickname ?? '없음'}
        </motion.p>
        <p className="screen__hint">{state.roundCount}라운드 합계 최고점</p>
        {state.ranking?.length > 1 && (
          <p className="screen__hint">
            {state.ranking.slice(0, 5).map((r) => `${r.nickname} ${r.points}점`).join(' · ')}
          </p>
        )}
      </div>
    );
  }

  if (state.status === 'ready') {
    return (
      <div className="screen__center">
        <p className="screen__eyebrow">색깔 사냥 — 곧 시작합니다</p>
        <p className="mg-screen__big">📷</p>
        <p className="screen__hint">폰에서 “카메라 켜기”를 눌러주세요</p>
      </div>
    );
  }

  return (
    <div className="screen__center ch-screen">
      <p className="screen__eyebrow">
        색깔 사냥 — {state.round}라운드 · 찾은 사람 {state.passedCount}명
      </p>

      <AnimatePresence mode="wait">
        <motion.div
          key={target?.id ?? 'none'}
          className="ch-screen__target"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={springPop}
        >
          <span className="ch-screen__chip" style={{ background: target?.swatch }} />
          <span className="ch-screen__word">{target?.name} 찾아!</span>
        </motion.div>
      </AnimatePresence>

      {tiles.length === 0 ? (
        <p className="screen__hint">
          {hunting ? '주변에서 그 색 물건을 찾아 폰으로 찍어주세요' : '올라온 색이 없어요'}
        </p>
      ) : (
        <ul
          className="ch-screen__grid"
          style={{
            '--ch-tile': tileMetrics(tiles.length).size,
            '--ch-name': tileMetrics(tiles.length).name,
          }}
        >
          <AnimatePresence initial={false}>
            {tiles.map((t) => (
              <motion.li
                key={t.participantId}
                className={`ch-tile${t.passed ? ' ch-tile--passed' : ''}`}
                layout
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={springSettle}
              >
                <span className="ch-tile__color" style={{ background: t.hex }}>
                  {t.passed && <span className="ch-tile__check" aria-hidden="true">✓</span>}
                </span>
                <span className="ch-tile__name">{t.nickname}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {state.status === 'closed' && state.lastRound && (
        <motion.p
          className="wordcloud-screen__top"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springSettle}
        >
          {state.lastRound.passed}명이 <strong>{state.lastRound.targetName}</strong> 을 찾았어요
        </motion.p>
      )}
    </div>
  );
}
