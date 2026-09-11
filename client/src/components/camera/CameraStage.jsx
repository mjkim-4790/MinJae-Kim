import { useCallback, useEffect, useRef } from 'react';
import { motion } from 'motion/react';

import { useCamera } from '../../hooks/useCamera.js';
import { springTap } from '../../lib/motionPresets.js';

// 카메라를 쓰는 게임들이 공유하는 껍데기 — 권한 받기, 미리보기, 촬영,
// 안 될 때의 빠져나갈 길까지. 무엇을 판정하는지는 전혀 모른다.
//
// 두 가지 방식을 다 받는다:
//   onCapture(canvas)      한 장 찍기 (색깔 사냥)
//   onFrame(video, ts)     매 프레임 (나중에 붙일 제스처·포즈 게임)
//
// ── 인식 실패를 오류로 띄우지 않는다 ──────────────────────────────────────
// fog 에 문구를 넘기면 화면에 안개가 낀다. "판정 실패: 밝기 부족" 같은 문구는
// 사람을 계측기 앞에 세우는 느낌을 준다. 안개는 게임 안의 일처럼 보이고,
// 무엇을 해야 하는지(더 밝은 곳으로)도 같이 말해준다.

// 찍은 프레임을 이 이상 키우지 않는다. 어차피 뒤에서 32×32 로 줄여 쓰기 때문에
// 큰 캔버스는 메모리만 먹는다.
const MAX_CAPTURE = 640;

export default function CameraStage({
  active = true,
  facingMode = 'environment',
  onCapture,
  onFrame,
  onActive, // 카메라가 실제로 켜졌을 때 한 번 부른다 (진행자에게 준비 인원을 알릴 때 쓴다)
  // 영상을 화면에 띄우지 않는다. 큰 화면 앞에서 하는 게임은 얼굴이 그대로 걸리므로,
  // 카메라는 돌리되 보여주는 건 인식 결과(손 뼈대 등)만으로 대신한다.
  hideVideo = false,
  fog = null,
  busy = false,
  shutterLabel = '찍기',
  hint = null,
  permissionTitle = '카메라를 켜주세요',
  // 게임마다 덮어쓴다. 기본값은 어느 게임에나 맞는 말로 둔다.
  permissionBody = '카메라 영상은 이 기기 안에서만 처리되고, 어디에도 저장되거나 전송되지 않습니다.',
  children,
}) {
  const camera = useCamera({ facingMode });
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const frameRef = useRef(null);
  const announcedRef = useRef(false);

  const { stream, granted, ready, error, supported, request, stop, markPlaying } = camera;

  // 게임이 끝나면 카메라를 놓는다 (표시등이 계속 켜져 있으면 불안해한다)
  useEffect(() => {
    if (!active) stop();
  }, [active, stop]);

  useEffect(() => {
    if (!stream || announcedRef.current) return;
    announcedRef.current = true;
    onActive?.();
  }, [stream, onActive]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return undefined;
    video.srcObject = stream;
    let cleanupWarmup;
    const onPlaying = () => {
      cleanupWarmup = markPlaying();
    };
    video.addEventListener('playing', onPlaying);
    video.play?.().catch(() => {});
    return () => {
      video.removeEventListener('playing', onPlaying);
      cleanupWarmup?.();
      video.srcObject = null;
    };
  }, [stream, markPlaying]);

  // 매 프레임 콜백 (B·C 용). 색깔 사냥은 쓰지 않는다.
  useEffect(() => {
    if (!onFrame || !stream || !ready) return undefined;
    const loop = (ts) => {
      const video = videoRef.current;
      if (video && video.readyState >= 2) onFrame(video, ts);
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [onFrame, stream, ready]);

  const drawToCanvas = useCallback((source, w, h) => {
    const scale = Math.min(1, MAX_CAPTURE / Math.max(w, h));
    const canvas = canvasRef.current ?? document.createElement('canvas');
    canvasRef.current = canvas;
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !onCapture) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return; // 아직 프레임이 없다 — 조용히 무시한다 (연타 방지)
    onCapture(drawToCanvas(video, w, h));
  }, [onCapture, drawToCanvas]);

  // 카메라를 못 쓰는 기기·거부한 사람을 위한 길. 폰의 기본 카메라 앱이 열리고,
  // 찍은 사진은 여기서 캔버스로만 읽고 버린다 (역시 서버로 가지 않는다).
  const onPickFile = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !onCapture) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        onCapture(drawToCanvas(img, img.naturalWidth, img.naturalHeight));
        URL.revokeObjectURL(url);
      };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    },
    [onCapture, drawToCanvas],
  );

  const fallback = onCapture && (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture={facingMode === 'user' ? 'user' : 'environment'}
        className="cam-file-input"
        onChange={onPickFile}
      />
      <button
        type="button"
        className="button button--ghost"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        사진으로 찍기
      </button>
    </>
  );

  if (!granted || !stream) {
    return (
      <div className="cam-stage cam-stage--ask">
        <p className="cam-stage__ask-title">{permissionTitle}</p>
        <p className="subtitle">{permissionBody}</p>
        {/* 카메라를 거부하고 '사진으로 찍기'만 쓰는 사람도 안개 안내를 봐야 한다.
            미리보기 화면이 없다고 아무 반응도 없으면 왜 안 되는지 알 수가 없다. */}
        {fog && <p className="cam-stage__fog-note">{fog}</p>}
        {error && <p className="error-text">{error}</p>}
        {supported && (
          <button className="button" onClick={request}>
            카메라 켜기
          </button>
        )}
        {fallback}
        {children}
      </div>
    );
  }

  return (
    <div className="cam-stage">
      <div className={`cam-stage__frame${hideVideo ? ' cam-stage__frame--hidden' : ''}`}>
        <video ref={videoRef} className="cam-stage__video" playsInline muted autoPlay />

        {/* 가운데 사각형 — 여기 든 색만 본다. 판정 범위를 눈으로 알려주지 않으면
            사람들이 화면 구석에 물건을 대고 왜 안 되냐고 묻는다. */}
        {!hideVideo && <div className="cam-stage__reticle" aria-hidden="true" />}

        {!ready && !hideVideo && <div className="cam-stage__veil">카메라 맞추는 중…</div>}

        {fog && (
          <motion.div
            className="cam-stage__fog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <span>{fog}</span>
          </motion.div>
        )}
      </div>

      {children}

      {onCapture && (
        <motion.button
          type="button"
          className="button cam-stage__shutter"
          disabled={!ready || busy}
          onClick={capture}
          whileTap={{ scale: 0.96 }}
          transition={springTap}
        >
          {busy ? '판정 중…' : shutterLabel}
        </motion.button>
      )}

      {hint && <p className="subtitle cam-stage__hint">{hint}</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
