import { useCallback, useEffect, useRef, useState } from 'react';

// MediaPipe 자세 인식기. 손 인식(useGestureRecognizer)과 같은 방침 —
// 전부 기기 안에서 돌고, wasm 과 모델은 우리 서버에서 내보낸다.
//
// lite 모델을 쓴다. full/heavy 는 더 정확하지만 아이패드에서 프레임이 떨어지고,
// 이 게임은 관절 '각도'만 보므로 lite 로 충분하다.
const WASM_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/models/pose_landmarker_lite.task';

let sharedPromise = null;

async function loadLandmarker() {
  if (sharedPromise) return sharedPromise;
  sharedPromise = (async () => {
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1, // 한 명씩 나와서 하는 게임 (운영 결정)
    });
  })().catch((err) => {
    sharedPromise = null;
    throw err;
  });
  return sharedPromise;
}

/**
 * @param {boolean} active 이 화면이 인식기를 쓰는 중인지
 * @returns {{ ready, loading, error, detect(video, timestampMs) }}
 *   detect 는 landmarks 배열(33점) 또는 null 을 돌려준다.
 */
export function usePoseLandmarker(active = true) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const ref = useRef(null);
  const lastTsRef = useRef(-1);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    setLoading(true);
    loadLandmarker()
      .then((r) => {
        if (cancelled) return;
        ref.current = r;
        setReady(true);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError('자세 인식을 준비하지 못했어요. 새로고침해 보세요.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const detect = useCallback((video, timestampMs) => {
    const r = ref.current;
    if (!r || !video || video.readyState < 2) return null;
    // 같은(또는 더 이른) 타임스탬프를 다시 주면 MediaPipe 가 예외를 던진다
    const ts = Math.max(timestampMs, lastTsRef.current + 1);
    lastTsRef.current = ts;
    try {
      const res = r.detectForVideo(video, ts);
      return res.landmarks?.[0] ?? null;
    } catch {
      return null;
    }
  }, []);

  return { ready, loading, error, detect };
}
