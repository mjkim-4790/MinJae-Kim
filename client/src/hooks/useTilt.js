import { useCallback, useEffect, useRef, useState } from 'react';

import { tiltToAxis } from '../lib/maze.js';

// 한 번 허용하면 이 페이지가 열려 있는 동안은 계속 유효하다(iOS 도 origin 단위로 기억한다).
// 그런데 허용 상태를 컴포넌트 state 에만 두면, 게임 화면이 잠깐 사라졌다 다시 그려질 때
// false 로 돌아가 "허용하기" 버튼이 또 뜬다 — 미리 눌러둔 게 소용없어진다.
// 그래서 모듈 밖에 기억해 둔다.
let grantedInThisPage = false;

/**
 * 폰 기울기를 읽는다.
 *
 * 까다로운 점 두 가지:
 *  1) iOS 13+ 는 사용자가 버튼을 직접 눌러야 권한을 준다(코드로 자동 허용 불가).
 *     그래서 request() 는 반드시 클릭 핸들러 안에서 불러야 한다.
 *  2) HTTPS(또는 localhost)에서만 동작한다. 같은 와이파이의 http://192.168.x.x 로
 *     접속하면 아이폰에서는 이벤트가 아예 오지 않는다.
 *
 * 기울기는 초당 60번 들어오므로 state 가 아니라 ref 에 담는다. state 로 두면
 * 매 프레임 리렌더가 나서 정작 공이 버벅인다.
 *
 * 방향은 "쟁반에 구슬" 기준이다. 폰을 눕혀 들고 위쪽 모서리를 내리면(beta 감소)
 * 공이 화면 위로, 오른쪽을 내리면(gamma 증가) 오른쪽으로 굴러간다.
 */
export function useTilt() {
  const axisRef = useRef({ ax: 0, ay: 0 });
  const baseRef = useRef({ beta: null, gamma: 0 });
  const [supported, setSupported] = useState(true);
  const [granted, setGranted] = useState(grantedInThisPage);
  const [error, setError] = useState(null);

  // iOS 는 권한 요청 함수가 따로 있다. 그게 있으면 물어봐야 하는 기기다.
  const needsPermission =
    typeof window !== 'undefined' &&
    typeof window.DeviceOrientationEvent?.requestPermission === 'function';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof window.DeviceOrientationEvent === 'undefined') setSupported(false);
  }, []);

  useEffect(() => {
    if (!granted) return undefined;

    let sawEvent = false;
    const onOrient = (e) => {
      if (e.beta == null && e.gamma == null) return;
      sawEvent = true;
      // 처음 들어온 값을 수평(0)으로 삼는다 — 사람마다 폰을 드는 각도가 달라서,
      // 그대로 쓰면 가만히 있어도 공이 한쪽으로 흘러내린다.
      if (baseRef.current.beta == null) {
        baseRef.current = { beta: e.beta ?? 0, gamma: e.gamma ?? 0 };
      }
      axisRef.current = {
        ax: tiltToAxis((e.gamma ?? 0) - baseRef.current.gamma),
        ay: tiltToAxis((e.beta ?? 0) - baseRef.current.beta),
      };
    };

    window.addEventListener('deviceorientation', onOrient);

    // 권한은 났는데 이벤트가 안 오는 기기가 있다(센서 없음 / 보안 컨텍스트 아님).
    // 조용히 안 움직이면 원인을 알 수 없으므로 알려준다.
    const check = setTimeout(() => {
      if (!sawEvent) {
        setSupported(false);
        setError('이 기기에서는 기울기 값이 오지 않습니다');
      }
    }, 1200);

    return () => {
      window.removeEventListener('deviceorientation', onOrient);
      clearTimeout(check);
    };
  }, [granted]);

  /** 반드시 클릭/터치 핸들러 안에서 부를 것 (iOS 요구사항). */
  const request = useCallback(async () => {
    setError(null);
    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
      setSupported(false);
      setError('이 기기는 기울기 센서를 지원하지 않습니다');
      return false;
    }
    if (!window.isSecureContext) {
      setSupported(false);
      setError('보안 연결(HTTPS)에서만 기울기를 쓸 수 있습니다');
      return false;
    }

    if (!needsPermission) {
      grantedInThisPage = true;
      setGranted(true);
      return true;
    }

    try {
      const res = await window.DeviceOrientationEvent.requestPermission();
      if (res === 'granted') {
        grantedInThisPage = true;
        setGranted(true);
        return true;
      }
      setError('기울기 사용이 거부됐습니다. 진행자에게 버튼 조작으로 바꿔달라고 하세요');
      return false;
    } catch {
      setError('권한을 받지 못했습니다. 다시 눌러보세요');
      return false;
    }
  }, [needsPermission]);

  /** 지금 든 자세를 다시 수평으로 잡는다. */
  const calibrate = useCallback(() => {
    baseRef.current = { beta: null, gamma: 0 };
    axisRef.current = { ax: 0, ay: 0 };
  }, []);

  return { axisRef, supported, granted, needsPermission, error, request, calibrate };
}
