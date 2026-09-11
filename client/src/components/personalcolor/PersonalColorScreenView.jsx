import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import CameraStage from '../camera/CameraStage.jsx';
import { useWakeLock } from '../../hooks/useWakeLock.js';
import { SKIN_READ_MS, readSkinTone } from '../../lib/personalColor.js';
import { springPop, springSettle } from '../../lib/motionPresets.js';

/**
 * 아이패드 화면 — 자기 얼굴을 보면서 얼굴 옆에 색을 대본다.
 *
 * ── 여기만 카메라 영상을 보여준다 ─────────────────────────────────────────
 * 다른 카메라 게임(후출 가위바위보·실루엣)은 영상을 감추고 인식 결과만 그렸다.
 * 퍼스널컬러는 **자기 얼굴 옆에 색을 대보는 것이 전부**라 영상을 가리면 할 수가 없다.
 * 대신 실시간 미리보기뿐이다 — 캡처도 저장도 전송도 하지 않고, 서버로 가는 건
 * 고른 쪽과 피부톤 hex 하나가 전부다.
 */
export default function PersonalColorScreenView({ state, sendSkin, answer }) {
  const active = state.status !== 'idle';
  useWakeLock(active);

  const [camOn, setCamOn] = useState(false);
  const [hint, setHint] = useState(null);
  const lastReadRef = useRef(0);
  const lastSentRef = useRef(null);
  const busyRef = useRef(false);

  const running = state.status === 'active';

  // 카메라 프레임에서 피부톤을 읽는다 (서버로는 hex 만 간다)
  const onFrame = useCallback(
    (video, ts) => {
      if (!running) return;
      if (ts - lastReadRef.current < SKIN_READ_MS) return;
      lastReadRef.current = ts;

      const res = readSkinTone(video);
      if (!res.ok) {
        setHint(res.reason);
        return;
      }
      setHint(null);
      // 같은 값을 반복해서 보내지 않는다
      if (res.hex === lastSentRef.current) return;
      lastSentRef.current = res.hex;
      sendSkin(res.hex);
    },
    [running, sendSkin],
  );

  useEffect(() => {
    if (state.status === 'active' && state.step === 0) {
      lastSentRef.current = null;
      setHint(null);
    }
  }, [state.status, state.step]);

  const pick = async (choice) => {
    if (busyRef.current) return;
    busyRef.current = true;
    await answer(choice);
    busyRef.current = false;
  };

  if (state.status === 'ended') {
    return (
      <div className="screen__center">
        <p className="screen__eyebrow">퍼스널컬러 찾아보기 — 종료</p>
        <p className="mg-screen__big">🎨</p>
        <p className="screen__hint">{state.doneCount}명이 자기 색을 찾았어요</p>
        {state.tally?.length > 0 && (
          <ul className="pc-tally">
            {state.tally.map((t) => (
              <li key={t.id} className="pc-tally__row">
                <span className="pc-tally__name">{t.name}</span>
                <span className="pc-tally__count">{t.count}명</span>
                <span className="pc-tally__who">{t.nicknames.join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const drape = state.drape;
  const result = state.lastResult;

  return (
    <div className="screen__center pc-screen">
      <p className="screen__eyebrow">
        퍼스널컬러 찾아보기
        {state.currentNickname ? ` — ${state.currentNickname}` : ''}
        {running ? ` · ${state.step + 1}/${state.total}` : ''}
      </p>

      {/* 얼굴과 색천을 **나란히** 둔다. 위아래로 쌓으면 색을 볼 때 얼굴이 화면 밖으로
          밀려나서, 정작 "이 색이 내 얼굴에 어떤가"를 못 본다. */}
      <div className="pc-row">
        <div className="pc-cam">
          <CameraStage
            active={active}
            facingMode="user"
            onActive={() => setCamOn(true)}
            onFrame={onFrame}
            permissionTitle="아이패드 카메라를 켜주세요"
            permissionBody="화면에 얼굴이 보이는 채로 색을 대봅니다. 사진을 찍거나 저장하지 않고, 어디로도 보내지 않습니다."
            overlay={running ? <div className="pc-facering" aria-hidden="true" /> : null}
          />
        </div>

        {camOn && (
        <AnimatePresence mode="wait">
          {state.status === 'ready' && (
            <motion.div key="wait" className="pc-screen__center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="pc-screen__big">
                {state.currentNickname ? `${state.currentNickname} 나오세요!` : '다음 사람을 기다리는 중'}
              </p>
              <p className="screen__hint">화면 가운데 동그라미에 얼굴을 맞춰주세요</p>
              {state.doneCount > 0 && (
                <p className="screen__hint">지금까지 {state.doneCount}명</p>
              )}
            </motion.div>
          )}

          {running && drape && (
            <motion.div key={`d-${state.step}`} className="pc-screen__center" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={springSettle}>
              <p className="pc-screen__q">{drape.question}</p>
              <div className="pc-choices">
                {['a', 'b'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="pc-choice"
                    style={{ '--pc-swatch': drape[k].color }}
                    onClick={() => pick(k)}
                  >
                    <span className="pc-choice__swatch" />
                    <span className="pc-choice__label">{drape[k].label}</span>
                  </button>
                ))}
              </div>
              {hint && <p className="pc-screen__warn">{hint}</p>}
            </motion.div>
          )}

          {state.status === 'result' && result && (
            <motion.div key="result" className="pc-screen__center" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springPop}>
              <p className="pc-screen__type">{result.typeName}</p>
              <p className="pc-screen__desc">{result.desc}</p>
              <ul className="pc-palette">
                {result.palette.map((c) => (
                  <li key={c} className="pc-palette__chip" style={{ background: c }} />
                ))}
              </ul>
              <p className="screen__hint">피하면 좋은 색: {result.avoid}</p>
              <p className="pc-screen__note">재미로 보는 결과예요 — 조명에 따라 달라질 수 있어요</p>
            </motion.div>
          )}
        </AnimatePresence>
        )}
      </div>
    </div>
  );
}
