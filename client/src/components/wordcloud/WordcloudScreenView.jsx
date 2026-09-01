import { AnimatePresence, motion } from 'motion/react';

import WordCloud from './WordCloud.jsx';
import { springSettle } from '../../lib/motionPresets.js';

/** 대형스크린의 단어 구름 — 구름 자체가 주인공이라 나머지는 최소한만 둔다. */
export default function WordcloudScreenView({ state }) {
  const collecting = state.status === 'collecting';

  return (
    <div className="screen__center wordcloud-screen">
      <p className="screen__eyebrow">
        단어 구름
        {state.status === 'closed' && ' · 마감'}
        {state.status === 'ended' && ' · 종료'}
      </p>

      {state.prompt && <h2 className="wordcloud-screen__prompt">{state.prompt}</h2>}

      <WordCloud
        words={state.words}
        emptyText={collecting ? '휴대폰으로 단어를 보내주세요' : '올라온 단어가 없어요'}
      />

      <AnimatePresence>
        {!collecting && state.top?.length > 0 && (
          <motion.p
            className="wordcloud-screen__top"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={springSettle}
          >
            가장 많이 나온 단어 <strong>{state.top.map((t) => t.word).join(', ')}</strong> ·{' '}
            {state.top[0].count}회
          </motion.p>
        )}
      </AnimatePresence>

      <p className="wordcloud-screen__meta">
        {state.contributorCount}명 참여 · 단어 {state.words.length}종 · 총 {state.totalCount}회
      </p>
    </div>
  );
}
