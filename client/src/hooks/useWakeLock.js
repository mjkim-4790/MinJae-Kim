import { useEffect, useRef, useState } from 'react';

// 행사 중에 화면이 꺼지면 안 된다. 대형화면은 물론이고, 카메라 게임은 참가자가
// 화면을 안 만지고 물건을 찾아다니는 시간이 길어서 자동 잠금에 걸리기 쉽다.
//
// Screen Wake Lock 은 Safari 16.4 / iPadOS 16.4 부터 쓸 수 있다. 그 아래 버전과
// 미지원 브라우저에서는 조용히 아무 일도 하지 않는다 — 화면이 꺼지는 건 불편이지
// 게임이 멈추는 사고가 아니라서, 경고를 띄워 진행을 방해할 이유가 없다.
//
// 잠금은 탭이 가려지거나 다른 앱으로 넘어가면 브라우저가 자동으로 풀어버린다.
// 돌아왔을 때 다시 잡지 않으면 그 뒤로는 그냥 꺼진다 — 그래서 visibilitychange 를 듣는다.

/**
 * @param {boolean} active 켜둘지 여부
 * @returns {{ supported: boolean, held: boolean }}
 */
export function useWakeLock(active = true) {
  const [held, setHeld] = useState(false);
  const lockRef = useRef(null);
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  useEffect(() => {
    if (!supported || !active) return undefined;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible' || lockRef.current) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        lockRef.current = lock;
        setHeld(true);
        // 브라우저가 스스로 풀었을 때도 알 수 있게 해둔다
        lock.addEventListener('release', () => {
          if (lockRef.current === lock) lockRef.current = null;
          setHeld(false);
        });
      } catch {
        // 배터리 절약 모드 등에서 거부될 수 있다. 게임은 그대로 진행된다.
        setHeld(false);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      const lock = lockRef.current;
      lockRef.current = null;
      setHeld(false);
      lock?.release().catch(() => {});
    };
  }, [supported, active]);

  return { supported, held };
}
