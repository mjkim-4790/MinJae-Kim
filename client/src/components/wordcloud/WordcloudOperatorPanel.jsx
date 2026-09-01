import { useState } from 'react';
import { motion } from 'motion/react';

import WordCloud from './WordCloud.jsx';
import { MODES, MAX_PRESET_WORDS, parsePresetInput } from '../../lib/wordcloud.js';
import { springPop } from '../../lib/motionPresets.js';

const ERROR_MESSAGE = {
  INVALID_MODE: '참여 방식을 선택하세요',
  NEED_MORE_WORDS: '버튼 단어를 2개 이상 넣어주세요',
  NOT_COLLECTING: '지금은 받는 중이 아닙니다',
  NOT_CLOSED: '마감된 상태가 아닙니다',
  NOT_RUNNING: '진행 중인 판이 없습니다',
  FORBIDDEN: '권한이 없습니다',
};

export default function WordcloudOperatorPanel({ game }) {
  const { state, start, close, reopen, end, reset } = game;
  const [mode, setMode] = useState('buttons');
  const [prompt, setPrompt] = useState('');
  const [wordsText, setWordsText] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const presetWords = parsePresetInput(wordsText);
  const canStart = mode === 'text' || presetWords.length >= 2;

  const run = async (action, ...args) => {
    setBusy(true);
    setError(null);
    const res = await action(...args);
    if (!res?.ok) setError(ERROR_MESSAGE[res?.error] ?? '요청에 실패했습니다');
    setBusy(false);
    return res;
  };

  // 시작 전 / 종료 후
  if (state.status === 'idle' || state.status === 'ended') {
    return (
      <div className="stack">
        {state.status === 'ended' && (
          <>
            <motion.div
              className="typing-final-banner"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springPop}
            >
              ☁️ 가장 많이 나온 단어:{' '}
              {state.top?.length ? state.top.map((t) => t.word).join(', ') : '없음'}
              {state.top?.length ? ` (${state.top[0].count}회)` : ''}
            </motion.div>
            <button className="button" disabled={busy} onClick={() => run(reset)}>
              확인
            </button>
          </>
        )}

        <p className="subtitle">
          참여자가 낸 단어가 대형화면에 실시간으로 쌓이고, 많이 나온 단어일수록 크게 보입니다.
          누가 냈는지는 아무에게도 보이지 않습니다.
        </p>

        <label className="field">
          <span className="field__label">참여 방식</span>
        </label>
        <ul className="typing-difficulty-grid">
          {MODES.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={`typing-difficulty-tile${mode === m.id ? ' typing-difficulty-tile--active' : ''}`}
                onClick={() => setMode(m.id)}
              >
                {m.name}
                <span className="wordcloud-mode-desc">{m.desc}</span>
              </button>
            </li>
          ))}
        </ul>

        <label className="field">
          <span className="field__label">주제 (선택)</span>
          <input
            className="input"
            placeholder="예: 오늘 기분을 한 단어로"
            maxLength={40}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>

        {mode === 'buttons' && (
          <label className="field">
            <span className="field__label">
              버튼 단어 (쉼표·줄바꿈으로 구분 · 최대 {MAX_PRESET_WORDS}개)
            </span>
            <textarea
              className="input wordcloud-preset-input"
              rows={3}
              placeholder="설렘, 긴장, 기대, 졸림"
              value={wordsText}
              onChange={(e) => setWordsText(e.target.value)}
            />
          </label>
        )}

        {mode === 'buttons' && presetWords.length > 0 && (
          <div className="acrostic-preview">
            {presetWords.map((w) => (
              <span key={w} className="acrostic-preview__chip">
                {w}
              </span>
            ))}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
        {!error && mode === 'buttons' && presetWords.length < 2 && (
          <p className="subtitle">버튼으로 쓸 단어를 2개 이상 적어주세요.</p>
        )}

        <button
          className="button"
          disabled={busy || !canStart}
          onClick={() => run(start, { mode, words: presetWords, prompt })}
        >
          {busy ? '시작하는 중…' : '시작하기'}
        </button>
      </div>
    );
  }

  const collecting = state.status === 'collecting';

  return (
    <div className="stack">
      {state.prompt && <p className="acrostic-prompt-banner">{state.prompt}</p>}

      <p className="badge badge--info">
        {collecting ? '받는 중' : '마감됨'} · {state.contributorCount}명 참여 · 단어{' '}
        {state.words.length}종 · 총 {state.totalCount}회
      </p>

      <WordCloud words={state.words} />

      {!collecting && state.top?.length > 0 && (
        <p className="wordcloud-top-line">
          가장 많이 나온 단어 <strong>{state.top.map((t) => t.word).join(', ')}</strong> ·{' '}
          {state.top[0].count}회
        </p>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="operator-topbar__actions operator-topbar__actions--split">
        {collecting ? (
          <button className="button" disabled={busy} onClick={() => run(close)}>
            제출 마감
          </button>
        ) : (
          <button className="button button--ghost" disabled={busy} onClick={() => run(reopen)}>
            다시 열기
          </button>
        )}
        <button className="button button--danger" disabled={busy} onClick={() => run(end)}>
          게임 종료
        </button>
      </div>
    </div>
  );
}
