import { useCallback, useRef, useState } from 'react';
import { motion } from 'motion/react';

import { fileToDataUrl } from '../../lib/outfit.js';
import { springPop, springTap } from '../../lib/motionPresets.js';

const UPLOAD_ERROR = {
  FORBIDDEN: '지금은 올릴 수 없어요',
  NOT_ACTIVE: '아직 시작 전이에요',
  TOO_MANY: '더 못 올려요 (최대 개수를 채웠어요)',
  INVALID_IMAGE: '이 사진은 못 읽었어요. 다른 사진으로 시도해 주세요',
};

/**
 * 참가자 폰 화면 — 이 코너에서 유일하게 폰이 할 일이 있는 곳(옷 사진 올리기).
 * 실제로 입어보는 모습은 아이패드에서 보여준다.
 */
export default function OutfitPlayerView({ game, participantId }) {
  const { state, dismissed, upload, dismiss } = game;
  const [uploaded, setUploaded] = useState([]); // 로컬 미리보기 — 서버는 사진을 돌려주지 않는다
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const mine = state.currentId != null && state.currentId === participantId;

  const onPick = useCallback(
    async (e) => {
      const files = [...(e.target.files ?? [])];
      e.target.value = '';
      if (!files.length) return;
      setBusy(true);
      setError(null);
      for (const file of files) {
        if ((state.outfitCount ?? 0) + uploaded.length >= (state.maxOutfits ?? 6)) {
          setError(`한 번에 최대 ${state.maxOutfits}벌까지만 올릴 수 있어요`);
          break;
        }
        try {
          const dataUrl = await fileToDataUrl(file);
          const res = await upload(dataUrl);
          if (res?.ok) {
            setUploaded((prev) => [...prev, { id: res.id, previewUrl: dataUrl }]);
          } else {
            setError(UPLOAD_ERROR[res?.error] ?? '올리지 못했어요');
            break;
          }
        } catch {
          setError('사진을 읽지 못했어요');
          break;
        }
      }
      setBusy(false);
    },
    [upload, state.outfitCount, state.maxOutfits, uploaded.length],
  );

  if (state.status === 'idle') return null;

  if (state.status === 'ended') {
    if (dismissed) return null;
    return (
      <section className="panel stack">
        <h2 className="panel__title">옷 입어보기 — 종료</h2>
        <p className="rps-spectator">{state.doneCount}명이 옷을 입어봤어요</p>
        <motion.button className="button" onClick={dismiss} whileTap={{ scale: 0.96 }} transition={springTap}>
          확인
        </motion.button>
      </section>
    );
  }

  if (!mine) {
    return (
      <section className="panel stack">
        <h2 className="panel__title">옷 입어보기</h2>
        <p className="rps-spectator">
          {state.currentNickname ? `${state.currentNickname} 님이 하는 중이에요` : '차례를 기다리는 중…'}
        </p>
      </section>
    );
  }

  return (
    <section className="panel stack">
      <h2 className="panel__title">옷 입어보기</h2>
      <motion.p
        className="chairs-verdict chairs-verdict--safe"
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={springPop}
      >
        내 차례예요! 옷 사진을 올려보세요
      </motion.p>
      <p className="subtitle">
        입고 싶은 옷 사진을 골라 올리면, 아이패드 화면에서 실시간으로 겹쳐 보여줍니다.
        여러 장 올려두고 아이패드에서 갈아입을 수 있어요 (최대 {state.maxOutfits}벌).
        <strong> 사진은 저장되지 않고, 코너가 끝나면 사라집니다.</strong>
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="cam-file-input"
        onChange={onPick}
      />
      <button
        type="button"
        className="button"
        disabled={busy || (state.outfitCount ?? 0) >= (state.maxOutfits ?? 6)}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? '올리는 중…' : '옷 사진 올리기'}
      </button>

      {uploaded.length > 0 && (
        <ul className="outfit-upload-thumbs">
          {uploaded.map((u) => (
            <li key={u.id}>
              <img src={u.previewUrl} alt="올린 옷" />
            </li>
          ))}
        </ul>
      )}

      <p className="subtitle">{state.outfitCount ?? 0}/{state.maxOutfits ?? 6}벌 올렸어요</p>
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}
