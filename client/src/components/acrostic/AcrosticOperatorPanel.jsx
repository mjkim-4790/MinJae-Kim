import { useState } from 'react';
import { motion } from 'motion/react';

import {
  composeEntry,
  MAX_SYLLABLES,
  MIN_PARTICIPANTS,
  MIN_SYLLABLES,
  splitPrompt,
} from '../../lib/acrostic.js';
import { springPop } from '../../lib/motionPresets.js';

const ERROR_MESSAGE = {
  NOT_ENOUGH_PARTICIPANTS: '참여자가 입장해야 시작할 수 있습니다',
  INVALID_PROMPT: `제시어는 ${MIN_SYLLABLES}~${MAX_SYLLABLES}글자로 입력하세요`,
  GAME_IN_PROGRESS: '이미 게임이 진행 중입니다. 먼저 리셋하세요',
  NOT_WRITING: '지금은 작성 단계가 아닙니다',
  NO_SUBMISSIONS: '아직 아무도 완료하지 않았습니다',
  NOT_VOTING: '지금은 투표 단계가 아닙니다',
  NOT_RESULT: '지금은 결과 단계가 아닙니다',
};

/** 작품 한 편 — 앞글자를 굵게 세워서 삼행시 형태 그대로 보여준다. */
function EntryLines({ syllables, lines }) {
  return (
    <ol className="acrostic-lines">
      {composeEntry(syllables, lines).map((text, i) => (
        <li key={i} className="acrostic-lines__row">
          <span className="acrostic-lines__head">{syllables[i]}</span>
          <span className="acrostic-lines__tail">{lines?.[i]}</span>
          <span className="sr-only">{text}</span>
        </li>
      ))}
    </ol>
  );
}

export default function AcrosticOperatorPanel({ game, participants }) {
  const { state, start, lock, reveal, advance, reset } = game;
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const activeCount = participants.filter((p) => p.status === 'active').length;

  const run = async (action, ...args) => {
    setBusy(true);
    setError(null);
    const res = await action(...args);
    if (!res?.ok) setError(ERROR_MESSAGE[res?.error] ?? '요청에 실패했습니다');
    setBusy(false);
    return res;
  };

  if (state.status === 'idle' || state.status === 'ended') {
    const syllables = splitPrompt(prompt);
    const promptValid = syllables.length >= MIN_SYLLABLES && syllables.length <= MAX_SYLLABLES;
    // 버튼이 왜 꺼져 있는지 항상 말해준다 — 이유 없이 비활성인 버튼은 고장으로 보인다
    const blockedReason =
      activeCount < MIN_PARTICIPANTS
        ? '참여자가 아직 없습니다. 참여자가 입장하면 시작할 수 있어요'
        : prompt.trim().length === 0
          ? null // 아직 아무것도 안 적은 상태에서까지 잔소리하지 않는다
          : !promptValid
            ? `제시어는 ${MIN_SYLLABLES}~${MAX_SYLLABLES}글자여야 합니다 (지금 ${syllables.length}글자)`
            : null;

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
              {state.ranking?.[0]?.votes > 0
                ? `🏆 1등: ${state.ranking
                    .filter((e) => e.rank === 1)
                    .map((e) => e.nickname)
                    .join(', ')} (${state.ranking[0].votes}표)`
                : '득표한 작품이 없었습니다'}
            </motion.div>
            {/* 게임 중에는 참여자 화면이 게임만 보여주므로, 점수·메시지·순위를 다시
                보여주려면 여기서 상태를 지워야 한다 (rps/liar/typing 패턴과 동일) */}
            <button className="button" disabled={busy} onClick={() => run(reset)}>
              확인
            </button>
          </>
        )}

        <p className="subtitle">
          제시어를 적고 확인을 누르면 참여자 화면에 뜹니다 (현재 참여자 {activeCount}명)
        </p>

        <label className="field">
          <span className="field__label">제시어 ({MIN_SYLLABLES}~{MAX_SYLLABLES}글자)</span>
          <input
            className="input acrostic-prompt-input"
            value={prompt}
            maxLength={MAX_SYLLABLES + 4}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="예: 레크레이"
          />
        </label>

        {syllables.length > 0 && (
          <div className="acrostic-preview">
            {syllables.map((s, i) => (
              <span key={i} className="acrostic-preview__chip">
                {s}
              </span>
            ))}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
        {!error && blockedReason && <p className="subtitle">{blockedReason}</p>}

        <button
          className="button"
          disabled={busy || !promptValid || activeCount < MIN_PARTICIPANTS}
          onClick={() => run(start, prompt)}
        >
          확인 (게임 시작)
        </button>
      </div>
    );
  }

  if (state.status === 'writing') {
    return (
      <div className="stack">
        <p className="acrostic-prompt-banner">{state.prompt}</p>
        <p className="badge badge--info">
          완료 {state.submittedParticipantIds.length}/{state.activeParticipantIds.length}
        </p>
        <p className="subtitle">참여자들이 삼행시를 적는 중입니다.</p>

        {error && <p className="error-text">{error}</p>}

        <div className="operator-topbar__actions">
          <button
            className="button"
            disabled={busy || state.submittedParticipantIds.length === 0}
            onClick={() => run(lock)}
          >
            마감 (투표 시작)
          </button>
          <button className="button button--danger" disabled={busy} onClick={() => run(reset)}>
            게임 강제 리셋
          </button>
        </div>
      </div>
    );
  }

  if (state.status === 'voting') {
    return (
      <div className="stack">
        <p className="acrostic-prompt-banner">{state.prompt}</p>
        <p className="badge badge--info">
          투표 {state.votedParticipantIds.length}/{state.activeParticipantIds.length}
        </p>
        <p className="subtitle">
          작품 {state.entries?.length ?? 0}편이 익명으로 올라갔습니다. 작성자는 결과에서 공개됩니다.
        </p>

        <ul className="acrostic-entry-list">
          {(state.entries ?? []).map((entry) => (
            <li key={entry.entryId} className="acrostic-entry-card">
              <span className="acrostic-entry-card__no">{entry.entryId}번</span>
              <EntryLines syllables={state.syllables} lines={entry.lines} />
            </li>
          ))}
        </ul>

        {error && <p className="error-text">{error}</p>}

        <div className="operator-topbar__actions">
          <button className="button" disabled={busy} onClick={() => run(reveal)}>
            투표 결과 확인
          </button>
          <button className="button button--danger" disabled={busy} onClick={() => run(reset)}>
            게임 강제 리셋
          </button>
        </div>
      </div>
    );
  }

  // result
  return (
    <motion.div
      className="stack"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springPop}
    >
      <p className="acrostic-prompt-banner">{state.prompt}</p>

      <ul className="acrostic-entry-list">
        {(state.ranking ?? []).map((entry) => (
          <li
            key={entry.entryId}
            className={`acrostic-entry-card${
              entry.rank === 1 && entry.votes > 0 ? ' acrostic-entry-card--winner' : ''
            }`}
          >
            <div className="acrostic-entry-card__meta">
              <span className="acrostic-entry-card__rank">{entry.rank}등</span>
              <span className="acrostic-entry-card__author">{entry.nickname}</span>
              <span className="acrostic-entry-card__votes">{entry.votes}표</span>
            </div>
            <EntryLines syllables={state.syllables} lines={entry.lines} />
          </li>
        ))}
      </ul>

      {error && <p className="error-text">{error}</p>}

      <div className="operator-topbar__actions">
        <button className="button button--ghost" disabled={busy} onClick={() => run(reset)}>
          게임 강제 리셋
        </button>
        <button className="button" disabled={busy} onClick={() => run(advance)}>
          확인 (점수 반영)
        </button>
      </div>
    </motion.div>
  );
}
