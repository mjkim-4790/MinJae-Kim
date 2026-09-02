import { useCallback, useEffect, useRef, useState } from 'react';

// 기울기(useTilt)와 달리 이건 '얼마나 흔들리는가'를 잰다.
// iOS 는 DeviceMotion 권한이 DeviceOrientation 과 별개라 따로 요청해야 한다.
//
// 한 번 허용하면 이 페이지가 열려 있는 동안 유효한데, 상태를 컴포넌트 안에만 두면
// 화면이 다시 그려질 때 false 로 돌아가 허용 버튼이 또 뜬다. 그래서 밖에 기억해 둔다
// (미로에서 겪은 것과 같은 문제).
let grantedInThisPage = false;

// 중력 성분을 빼기 위한 저역통과 계수. 이 값이 클수록 천천히 따라간다.
const GRAVITY_SMOOTH = 0.85;

/**
 * 폰이 흔들리는 세기를 잰다.
 *
 * shakeRef.current 는 "중력을 뺀 가속도의 크기(m/s²)"다. 가만히 들고 있으면
 * 손떨림 때문에 0.2~0.5 정도가 나오고, 걷듯이 흔들면 3~10 까지 올라간다.
 * 초당 수십 번 갱신되므로 state 가 아니라 ref 에 담는다.
 */
export function useMotion() {
  const shakeRef = useRef(0);
  const gravityRef = useRef({ x: 0, y: 0, z: 0 });
  const [supported, setSupported] = useState(true);
  const [granted, setGranted] = useState(grantedInThisPage);
  const [error, setError] = useState(null);

  const needsPermission =
    typeof window !== 'undefined' &&
    typeof window.DeviceMotionEvent?.requestPermission === 'function';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof window.DeviceMotionEvent === 'undefined') setSupported(false);
  }, []);

  useEffect(() => {
    if (!granted) return undefined;

    let sawEvent = false;
    const onMotion = (e) => {
      // accelerationIncludingGravity 는 어느 기기에나 있다.
      // acceleration(중력 제외)은 없는 기기가 있어서 직접 빼는 쪽이 안전하다.
      const a = e.accelerationIncludingGravity;
      if (!a || (a.x == null && a.y == null && a.z == null)) return;
      sawEvent = true;

      const g = gravityRef.current;
      g.x = GRAVITY_SMOOTH * g.x + (1 - GRAVITY_SMOOTH) * (a.x ?? 0);
      g.y = GRAVITY_SMOOTH * g.y + (1 - GRAVITY_SMOOTH) * (a.y ?? 0);
      g.z = GRAVITY_SMOOTH * g.z + (1 - GRAVITY_SMOOTH) * (a.z ?? 0);

      const dx = (a.x ?? 0) - g.x;
      const dy = (a.y ?? 0) - g.y;
      const dz = (a.z ?? 0) - g.z;
      shakeRef.current = Math.hypot(dx, dy, dz);
    };

    window.addEventListener('devicemotion', onMotion);

    // 권한은 났는데 값이 안 오는 기기가 있다(센서 없음 / 보안 컨텍스트 아님).
    // 조용히 안 움직이면 원인을 알 수 없으므로 알려준다.
    const check = setTimeout(() => {
      if (!sawEvent) {
        setSupported(false);
        setError('이 기기에서는 움직임 값이 오지 않습니다');
      }
    }, 1500);

    return () => {
      window.removeEventListener('devicemotion', onMotion);
      clearTimeout(check);
    };
  }, [granted]);

  /** 반드시 클릭/터치 핸들러 안에서 부를 것 (iOS 요구사항). */
  const request = useCallback(async () => {
    setError(null);
    if (typeof window === 'undefined' || typeof window.DeviceMotionEvent === 'undefined') {
      setSupported(false);
      setError('이 기기는 움직임 센서를 지원하지 않습니다');
      return false;
    }
    if (!window.isSecureContext) {
      setSupported(false);
      setError('보안 연결(HTTPS)에서만 움직임을 읽을 수 있습니다');
      return false;
    }

    if (!needsPermission) {
      grantedInThisPage = true;
      setGranted(true);
      return true;
    }

    try {
      const res = await window.DeviceMotionEvent.requestPermission();
      if (res === 'granted') {
        grantedInThisPage = true;
        setGranted(true);
        return true;
      }
      setError('움직임 사용이 거부됐습니다. 설정에서 허용해야 참여할 수 있어요');
      return false;
    } catch {
      setError('권한을 받지 못했습니다. 다시 눌러보세요');
      return false;
    }
  }, [needsPermission]);

  return { shakeRef, supported, granted, needsPermission, error, request };
}
