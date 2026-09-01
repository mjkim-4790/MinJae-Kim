import { useState } from 'react';
import { motion } from 'motion/react';

import WordCloud from './WordCloud.jsx';
import { MAX_WORD_LEN } from '../../lib/wordcloud.js';
import { springPop, springTap } from '../../lib/motionPresets.js';

/** 참여자 화면의 단어 구름 영역. status==='idle' 이면 아무것도 렌더링하지 않는다. */
export default function WordcloudPlayerView({ game }) {
  const { state, myWords, dismissed, submit, dismiss } = game;
  const [draft, setDraft] = useState('');

  if (state.status === 'idle') return null;

  if (state.status === 'ended') {
    if (dismissed) return null;
    return (
      <section className="panel stack">
        <h2 className="panel__title">단어 구름 — 종료</h2>
        <motion.p
          className="typing-final-banner"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springPop}
        >
          ☁️ 가장 많이 나온 단어:{' '}
          {state.top?.length ? state.top.map((t) => t.word).join(', ') : '없음'}
        </motion.p>
        <WordCloud words={state.words} emptyText="올라온 단어가 없었어요" />
        <motion.button className="button" onClick={dismiss} whileTap={{ scale: 0.96 }} transition={springTap}>
          확인
        </motion.button>
      </section>
    );
  }

  const collecting = state.status === 'collecting';
  const myTotal = [...myWords.values()].reduce((a, b) => a + b, 0);

  const sendDraft = () => {
    const word = draft.trim();
    if (!word) return;
    submit(word);
    setDraft('');
  };

  return (
    <section className="panel stack wordcloud-stage">
      <h2 className="panel__title">단어 구름</h2>
      {state.prompt && <p className="acrostic-prompt-banner">{state.prompt}</p>}

      {!collecting && <p className="badge badge--info">제출이 마감됐습니다</p>}

      {collecting && state.mode === 'buttons' && (
        <>
          <p className="subtitle">마음에 드는 단어를 누르세요. 여러 번 눌러도 됩니다!</p>
          <div className="wordcloud-buttons">
            {state.presetWords.map((word) => {
              const mine = myWords.get(word) ?? 0;
              return (
                <motion.button
                  key={word}
                  type="button"
                  className={`wordcloud-button${mine > 0 ? ' wordcloud-button--mine' : ''}`}
                  onClick={() => submit(word)}
                  whileTap={{ scale: 0.94 }}
                  transition={springTap}
                >
                  <span className="wordcloud-button__word">{word}</span>
                  {mine > 0 && <span className="wordcloud-button__count">{mine}</span>}
                </motion.button>
              );
            })}
          </div>
        </>
      )}

      {collecting && state.mode === 'text' && (
        <>
          <p className="subtitle">단어를 적어 보내세요. 생각날 때마다 계속 낼 수 있어요.</p>
          <form
            className="wordcloud-form"
            onSubmit={(e) => {
              e.preventDefault();
              sendDraft();
            }}
          >
            <input
              className="input"
              placeholder="한 단어로"
              maxLength={MAX_WORD_LEN}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="button" type="submit" disabled={!draft.trim()}>
              보내기
            </button>
          </form>
        </>
      )}

      {myTotal > 0 && (
        <p className="subtitle">
          내가 낸 단어 ({myTotal}회):{' '}
          {[...myWords.entries()].map(([w, c]) => (c > 1 ? `${w}×${c}` : w)).join(', ')}
        </p>
      )}

      <WordCloud words={state.words} />

      <p className="subtitle">
        {state.contributorCount}명 참여 · 단어 {state.words.length}종
      </p>
    </section>
  );
}
