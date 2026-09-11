import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import CameraStage from '../camera/CameraStage.jsx';
import { usePoseLandmarker } from '../../hooks/usePoseLandmarker.js';
import { useWakeLock } from '../../hooks/useWakeLock.js';
import {
  bodyAnchorsFromLandmarks,
  boundingBoxOfAlpha,
  pushSmoothed,
  removeBackground,
  solveAffine,
  templatePoints,
  videoPointToCanvas,
} from '../../lib/outfit.js';
import { springSettle } from '../../lib/motionPresets.js';

/**
 * 아이패드 화면 — 실시간으로 내 모습 위에 고른 옷을 겹쳐 보여준다.
 *
 * ── 카메라 영상을 그대로 보여준다 (퍼스널컬러와 같은 이유) ────────────────
 * "이 옷을 입으면 어떨지" 를 보는 게 전부라 영상을 가릴 수 없다.
 *
 * ── 거울처럼 화면 전체를 좌우로 뒤집는다 ──────────────────────────────────
 * 실제 거울처럼 내 오른손이 화면 오른쪽에 보여야 자연스럽다. CSS 로
 * `.cam-stage__frame` 만 뒤집는다(styles.css `.outfit-screen`) — 그 안의 비디오와
 * 옷 오버레이 캔버스가 같은 좌표계에서 함께 그려진 뒤 화면에 낼 때 한 번에
 * 뒤집히므로, 좌표 계산은 전부 원본(뒤집기 전) 공간에서 하면 된다. 안내
 * 문구·버튼은 프레임 바깥에 있어 같이 뒤집히지 않는다.
 *
 * ── 옷 사진 처리는 고를 때 한 번만 한다 ────────────────────────────────────
 * 배경 제거는 800px 사진 전체를 훑는 일이라 매 프레임 하기엔 무겁다. 옷이
 * 서버에서 도착하거나 새로 선택될 때 한 번 계산해 캐시해두고, 매 프레임은
 * 그 결과를 몸 위치에 맞춰 그리기만 한다.
 */
export default function OutfitScreenView({ state, select }) {
  const active = state.status !== 'idle';
  const landmarker = usePoseLandmarker(active);
  useWakeLock(active);

  const [camOn, setCamOn] = useState(false);
  const [bodyFound, setBodyFound] = useState(true);
  const overlayRef = useRef(null);
  const anchorHistoryRef = useRef({ shoulderL: [], shoulderR: [], hipCenter: [] });
  const cutoutCacheRef = useRef(new Map()); // outfitId -> 'loading' | { canvas, template }
  const selectedRef = useRef(null);
  selectedRef.current = state.selectedId;
  const bodyFoundRef = useRef(true);

  const outfits = state.outfits ?? [];

  // 캔버스 픽셀 크기를 표시 크기에 맞춘다
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return undefined;
    const parent = canvas.parentElement;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, parent.clientWidth * dpr);
      canvas.height = Math.max(1, parent.clientHeight * dpr);
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(parent);
    return () => obs.disconnect();
  }, [camOn]);

  // 옷이 새로 오거나(업로드) 목록이 바뀌면, 아직 처리 안 한 것만 배경 제거 + 템플릿 계산
  useEffect(() => {
    const cache = cutoutCacheRef.current;
    for (const o of outfits) {
      if (cache.has(o.id)) continue;
      cache.set(o.id, 'loading');
      const img = new Image();
      img.onload = () => {
        const raw = document.createElement('canvas');
        raw.width = img.naturalWidth;
        raw.height = img.naturalHeight;
        raw.getContext('2d').drawImage(img, 0, 0);
        const cutout = removeBackground(raw);
        const bbox = boundingBoxOfAlpha(cutout);
        cache.set(o.id, { canvas: cutout, template: templatePoints(bbox) });
      };
      img.onerror = () => cache.delete(o.id);
      img.src = o.dataUrl;
    }
    // 서버에서 이미 사라진 옷(다음 사람으로 넘어감 등)은 캐시에서도 지운다
    const liveIds = new Set(outfits.map((o) => o.id));
    for (const id of [...cache.keys()]) {
      if (!liveIds.has(id)) cache.delete(id);
    }
  }, [outfits]);

  const onFrame = useCallback(
    (video, ts) => {
      const landmarks = landmarker.detect(video, ts);
      const anchors = bodyAnchorsFromLandmarks(landmarks);
      if (!!anchors !== bodyFoundRef.current) {
        bodyFoundRef.current = !!anchors;
        setBodyFound(!!anchors);
      }

      const hist = anchorHistoryRef.current;
      const sl = pushSmoothed(hist.shoulderL, anchors?.shoulderL ?? null);
      const sr = pushSmoothed(hist.shoulderR, anchors?.shoulderR ?? null);
      const hc = pushSmoothed(hist.hipCenter, anchors?.hipCenter ?? null);
      hist.shoulderL = sl.history;
      hist.shoulderR = sr.history;
      hist.hipCenter = hc.history;

      const canvas = overlayRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const entry = selectedRef.current != null ? cutoutCacheRef.current.get(selectedRef.current) : null;
      if (!entry || entry === 'loading' || !sl.avg || !sr.avg || !hc.avg) return;

      const dst = [
        videoPointToCanvas(sl.avg.x, sl.avg.y, video.videoWidth, video.videoHeight, canvas.width, canvas.height),
        videoPointToCanvas(sr.avg.x, sr.avg.y, video.videoWidth, video.videoHeight, canvas.width, canvas.height),
        videoPointToCanvas(hc.avg.x, hc.avg.y, video.videoWidth, video.videoHeight, canvas.width, canvas.height),
      ];
      const src = [entry.template.shoulderL, entry.template.shoulderR, entry.template.hipCenter];
      const m = solveAffine(src, dst);
      if (!m) return;
      ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
      ctx.drawImage(entry.canvas, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    [landmarker],
  );

  if (state.status === 'ended') {
    return (
      <div className="screen__center">
        <p className="screen__eyebrow">옷 입어보기 — 종료</p>
        <p className="mg-screen__big">👕</p>
        <p className="screen__hint">{state.doneCount}명이 옷을 입어봤어요</p>
      </div>
    );
  }

  return (
    <div className="screen__center outfit-screen">
      <p className="screen__eyebrow">
        옷 입어보기
        {state.currentNickname ? ` — ${state.currentNickname}` : ''}
      </p>

      <div className="outfit-cam">
        <CameraStage
          active={active}
          facingMode="user"
          onActive={() => setCamOn(true)}
          onFrame={onFrame}
          permissionTitle="아이패드 카메라를 켜주세요"
          permissionBody="화면에 내 모습이 보이는 채로 옷을 대봅니다. 사진을 저장하지 않고, 어디로도 보내지 않습니다."
          overlay={<canvas ref={overlayRef} className="outfit-overlay" aria-hidden="true" />}
        />
      </div>

      {camOn && (
        <AnimatePresence mode="wait">
          {state.status === 'ready' && (
            <motion.div key="wait" className="outfit-screen__hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="pc-screen__big">
                {state.currentNickname ? `${state.currentNickname} 나오세요!` : '다음 사람을 기다리는 중'}
              </p>
              <p className="screen__hint">
                {outfits.length === 0 ? '폰에서 옷 사진을 올려주세요' : '아래에서 옷을 골라보세요'}
              </p>
            </motion.div>
          )}
          {/* "물러나 주세요"는 자세 인식이 돌고 있는데 몸을 못 찾을 때만 띄운다.
              모델이 아직 준비 중이거나 실패했을 때 같은 문구를 보이면, 현장 진행자가
              "사람이 안 나와서"로 오해하고 계속 물러나 봐도 원인이 안 고쳐진다. */}
          {state.status === 'active' && landmarker.loading && (
            <motion.p key="loading" className="outfit-screen__warn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              자세 인식을 준비하는 중…
            </motion.p>
          )}
          {state.status === 'active' && !landmarker.loading && landmarker.error && (
            <motion.p key="err" className="outfit-screen__warn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {landmarker.error}
            </motion.p>
          )}
          {state.status === 'active' && landmarker.ready && !bodyFound && (
            <motion.p key="nobody" className="outfit-screen__warn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              상반신이 보이게 조금 물러나 주세요
            </motion.p>
          )}
        </AnimatePresence>
      )}

      {camOn && outfits.length > 0 && (
        <motion.ul className="outfit-strip" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={springSettle}>
          {outfits.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className={`outfit-strip__item${state.selectedId === o.id ? ' outfit-strip__item--active' : ''}`}
                onClick={() => select(o.id)}
              >
                <img src={o.dataUrl} alt="옷" />
              </button>
            </li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}
