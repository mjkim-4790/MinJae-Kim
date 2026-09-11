import { useCallback, useEffect, useRef, useState } from 'react';

// 카메라를 켜고 끄는 일만 한다. 프레임으로 무엇을 하는지는 게임이 정한다
// (색깔 사냥은 한 장을 찍고, 나중에 붙일 제스처·포즈 게임은 매 프레임을 읽는다).
//
// useMotion.js 와 같은 구조를 따른다 — 권한을 페이지 밖에 기억해 두고,
// 보안 컨텍스트를 먼저 확인하고, "권한은 났는데 값이 안 오는" 경우를 따로 잡는다.
//
// 한 번 허용하면 이 페이지가 열려 있는 동안 유효한데, 상태를 컴포넌트 안에만 두면
// 화면이 다시 그려질 때 허용 버튼이 또 뜬다. 그래서 밖에 기억해 둔다.
let grantedInThisPage = false;

// iOS 는 카메라를 연 직후 노출·화이트밸런스를 맞추느라 첫 프레임들이 어둡거나
// 색이 틀어져 있다. 그 사이에 찍으면 실력과 무관하게 오판정이 난다.
// 색을 다루는 게임이라 이 대기가 곧 '영점 잡기'다.
const WARMUP_MS = 700;

// 권한이 났는데도 영상이 안 들어오는 기기가 있다 (다른 앱이 카메라를 쥐고 있거나
// 가상 카메라만 있는 경우). 조용히 검은 화면만 보이면 원인을 알 수 없으므로 알려준다.
const NO_FRAME_MS = 4000;

const MESSAGE = {
  INSECURE:
    '카메라는 보안 연결(https)에서만 켤 수 있어요. 진행자에게 알려주세요.',
  UNSUPPORTED: '이 기기·브라우저에서는 카메라를 쓸 수 없어요.',
  NotAllowedError:
    '카메라 사용이 거부됐어요. 브라우저 설정에서 허용하거나, 아래 "사진으로 찍기"를 쓰세요.',
  NotFoundError: '카메라를 찾지 못했어요. 아래 "사진으로 찍기"를 쓰세요.',
  NotReadableError: '다른 앱이 카메라를 쓰고 있어요. 그 앱을 닫고 다시 눌러주세요.',
  DEFAULT: '카메라를 켜지 못했어요. 다시 눌러보세요.',
};

/**
 * @param {object} opts
 * @param {'environment'|'user'} [opts.facingMode] 후면(기본) / 전면
 */
export function useCamera({ facingMode = 'environment' } = {}) {
  const [stream, setStream] = useState(null);
  const [granted, setGranted] = useState(grantedInThisPage);
  const [ready, setReady] = useState(false); // 워밍업까지 끝나 찍어도 되는 상태
  const [error, setError] = useState(null);
  const [supported, setSupported] = useState(true);
  const streamRef = useRef(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    if (!navigator.mediaDevices?.getUserMedia) setSupported(false);
  }, []);

  const stop = useCallback(() => {
    const s = streamRef.current;
    streamRef.current = null;
    if (s) s.getTracks().forEach((t) => t.stop());
    setStream(null);
    setReady(false);
  }, []);

  // 화면을 떠나면 반드시 끈다. 카메라가 켜진 채 남으면 표시등이 계속 들어와 있어
  // 사람들이 불안해하고, 배터리도 먹는다.
  useEffect(() => stop, [stop]);

  /** 반드시 클릭/터치 핸들러 안에서 부를 것 (iOS 요구사항). */
  const request = useCallback(async () => {
    if (busyRef.current) return false;
    setError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      setError(MESSAGE.UNSUPPORTED);
      return false;
    }
    // localhost 는 예외적으로 보안 컨텍스트라 개발 중에는 이 검사에 안 걸린다.
    if (!window.isSecureContext) {
      setError(MESSAGE.INSECURE);
      return false;
    }

    busyRef.current = true;
    try {
      let media;
      try {
        media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 } },
          audio: false,
        });
      } catch (err) {
        // 노트북처럼 후면 카메라가 없는 기기 — 아무 카메라나 받는다.
        // 색깔 사냥은 후면이 편할 뿐 전면으로도 게임은 된다.
        if (err?.name !== 'OverconstrainedError') throw err;
        media = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = media;
      setStream(media);
      grantedInThisPage = true;
      setGranted(true);
      return true;
    } catch (err) {
      setError(MESSAGE[err?.name] ?? MESSAGE.DEFAULT);
      if (err?.name === 'NotFoundError') setSupported(false);
      return false;
    } finally {
      busyRef.current = false;
    }
  }, [facingMode]);

  /** 비디오가 실제로 재생되기 시작했을 때 컴포넌트가 알려준다 → 워밍업 시작. */
  const markPlaying = useCallback(() => {
    const timer = setTimeout(() => setReady(true), WARMUP_MS);
    return () => clearTimeout(timer);
  }, []);

  // 스트림은 붙었는데 영상이 안 들어오는 경우를 잡는다
  useEffect(() => {
    if (!stream || ready) return undefined;
    const timer = setTimeout(() => {
      if (!streamRef.current) return;
      const track = streamRef.current.getVideoTracks()[0];
      if (!track || track.readyState !== 'live') {
        setError(MESSAGE.NotReadableError);
      }
    }, NO_FRAME_MS);
    return () => clearTimeout(timer);
  }, [stream, ready]);

  return { stream, granted, ready, error, supported, request, stop, markPlaying };
}
