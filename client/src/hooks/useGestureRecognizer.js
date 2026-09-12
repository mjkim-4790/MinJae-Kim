import { useCallback, useEffect, useRef, useState } from 'react';

// MediaPipe 손 제스처 인식기. 전부 기기 안에서 돈다 — 영상은 어디로도 나가지 않는다.
//
// ── wasm 과 모델을 우리 서버에서 내보내는 이유 ─────────────────────────────
// 공식 예제는 CDN(jsdelivr)을 가리키는데, 행사장 네트워크가 막히거나 느리면
// 게임이 통째로 안 열린다. 외부 호출을 안 한다는 게 이 프로젝트의 전제이기도 하다.
// wasm 은 빌드할 때 node_modules 에서 public/ 으로 복사하고(vite.config.js),
// 모델 파일은 저장소에 같이 넣어 둔다.
const WASM_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/models/gesture_recognizer.task';

// 인식기는 한 번만 만들어 페이지 안에서 돌려쓴다. 8MB 모델을 화면 옮길 때마다
// 다시 읽으면 아이패드가 몇 초씩 멈춘다.
//
// 손 개수별로 따로 둔다 — 후출 가위바위보는 한 손이면 되고(빠르다), 과일 자르기는
// 양손을 써야 한다. 개수는 인식기를 만들 때 고정되는 값이라 하나로 못 돌려쓴다.
// 모델 파일 자체는 브라우저가 캐시하므로 두 번째 인식기는 내려받지 않는다.
const sharedByHands = new Map();

async function loadRecognizer(numHands) {
  if (sharedByHands.has(numHands)) return sharedByHands.get(numHands);
  const promise = (async () => {
    // 이 게임을 열 때만 불러온다. 첫 화면부터 들고 있으면 모든 참가자 폰이
    // 쓰지도 않을 큰 묶음을 받게 된다.
    const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    return GestureRecognizer.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands,
    });
  })().catch((err) => {
    sharedByHands.delete(numHands); // 실패하면 다음에 다시 시도할 수 있게
    throw err;
  });
  sharedByHands.set(numHands, promise);
  return promise;
}

/**
 * @param {boolean} active 이 화면이 인식기를 쓰는 중인지 (false 면 불러오지 않는다)
 * @param {{ numHands?: number }} [options] 기본 1. 양손이 필요한 게임만 2 로 준다.
 * @returns {{ ready, loading, error, recognize(video, timestampMs) }}
 *   recognize 는 { gesture, score, landmarks, hands } 를 돌려준다.
 *   landmarks 는 첫 손, hands 는 잡힌 손 전부. 손이 없으면 gesture 가 null.
 */
export function useGestureRecognizer(active = true, { numHands = 1 } = {}) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const ref = useRef(null);
  const lastTsRef = useRef(-1);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    setLoading(true);
    loadRecognizer(numHands)
      .then((r) => {
        if (cancelled) return;
        ref.current = r;
        setReady(true);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError('손 인식을 준비하지 못했어요. 새로고침해 보세요.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, numHands]);

  const recognize = useCallback((video, timestampMs) => {
    const r = ref.current;
    if (!r || !video || video.readyState < 2) return null;
    // MediaPipe 는 같은(또는 더 이른) 타임스탬프를 다시 주면 예외를 던진다.
    // 화면이 잠깐 멈췄다 돌아올 때 실제로 그런 프레임이 들어온다.
    const ts = Math.max(timestampMs, lastTsRef.current + 1);
    lastTsRef.current = ts;
    try {
      const res = r.recognizeForVideo(video, ts);
      const top = res.gestures?.[0]?.[0] ?? null;
      return {
        gesture: top?.categoryName ?? null,
        score: top?.score ?? 0,
        landmarks: res.landmarks?.[0] ?? null,
        hands: res.landmarks ?? [],
      };
    } catch {
      // 한 프레임 실패는 무시한다 — 다음 프레임이 곧 온다
      return null;
    }
  }, []);

  return { ready, loading, error, recognize };
}
