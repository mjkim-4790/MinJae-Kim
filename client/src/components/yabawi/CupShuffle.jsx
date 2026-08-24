import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { resolveFinalPositions } from '../../lib/yabawi.js';

// 보드 좌표계 (px). 화면 폭에 맞춰 통째로 scale 하므로 여기 값은 고정이다 —
// 컵이 SVG 라서 확대·축소해도 선이 뭉개지지 않는다.
const SLOT_W = 112;
const CUP_W = 92;
const CUP_H = 74;
const BOARD_H = 176;
const CUP_BOTTOM = 30; // 컵이 쉬는 자리(보드 바닥에서 띄운 높이)

// 스왑할 때 한 컵은 위로, 다른 컵은 아래로 지나간다. 위로 가는 쪽이 컵 높이보다 더
// 크게 뜨므로 두 컵이 겹치지 않는다 — z-index 를 프레임마다 바꿀 필요가 없다.
const ARC_UP = 64;
const ARC_DOWN = 14;
const REVEAL_LIFT = 58; // 공을 보여줄 때 컵을 드는 높이

const slotX = (slot) => slot * SLOT_W;

/**
 * 섞기 전 구간의 키프레임을 컵마다 미리 다 만들어 둔다.
 *
 * 프레임 유지의 핵심: 스왑을 하나씩 순차 실행(setTimeout/재귀 애니메이션)하지 않고,
 * 처음부터 끝까지의 키프레임 배열 하나를 Web Animations API 에 통째로 넘긴다.
 * 그러면 브라우저가 이 애니메이션을 컴포지터 스레드에서 돌리므로, 자바스크립트가
 * 잠깐 바빠도(리렌더·소켓 수신 등) 움직임이 끊기지 않는다.
 * transform 만 움직이는 것도 같은 이유다 (레이아웃·페인트를 다시 하지 않는다).
 */
function buildTimeline({ cups, initialBallIndex, swaps, swapDurationMs, placeMs }) {
  const total = placeMs + swaps.length * swapDurationMs;
  const frames = Array.from({ length: cups }, () => []);
  const cupAtSlot = Array.from({ length: cups }, (_, i) => i);
  const slotOfCup = Array.from({ length: cups }, (_, i) => i);

  const push = (cup, timeMs, x, y, easing) => {
    frames[cup].push({
      offset: Math.min(1, timeMs / total),
      transform: `translate3d(${x}px, ${y}px, 0)`,
      ...(easing ? { easing } : {}),
    });
  };

  // 1) 출발 자리
  for (let c = 0; c < cups; c += 1) push(c, 0, slotX(slotOfCup[c]), 0, 'ease-out');

  // 2) 공이 든 컵만 들었다 놓는다 (나머지는 제자리를 지키는 키프레임만 찍는다)
  const ballCup = cupAtSlot[initialBallIndex];
  for (let c = 0; c < cups; c += 1) {
    const x = slotX(slotOfCup[c]);
    if (c === ballCup) {
      push(c, placeMs * 0.28, x, -REVEAL_LIFT, 'linear');
      push(c, placeMs * 0.72, x, -REVEAL_LIFT, 'ease-in-out');
    }
    // placeMs 지점의 easing 'ease-in' 은 이어지는 첫 스왑의 "가속" 구간을 맡는다
    push(c, placeMs, x, 0, 'ease-in');
  }

  // 3) 섞기 — 스왑마다 가속(ease-in) → 정점 → 감속(ease-out)
  swaps.forEach(([sa, sb], i) => {
    const t0 = placeMs + i * swapDurationMs;
    const tMid = t0 + swapDurationMs / 2;
    const t1 = t0 + swapDurationMs;
    const ca = cupAtSlot[sa];
    const cb = cupAtSlot[sb];
    const xa = slotX(sa);
    const xb = slotX(sb);
    const xMid = (xa + xb) / 2;

    for (let c = 0; c < cups; c += 1) {
      if (c === ca) {
        push(c, tMid, xMid, -ARC_UP, 'ease-out');
        push(c, t1, xb, 0, 'ease-in');
      } else if (c === cb) {
        push(c, tMid, xMid, ARC_DOWN, 'ease-out');
        push(c, t1, xa, 0, 'ease-in');
      } else {
        // 안 움직이는 컵도 구간 끝에 키프레임을 찍어야 그 사이를 보간하지 않고 제자리를 지킨다
        push(c, t1, slotX(slotOfCup[c]), 0, 'ease-in');
      }
    }

    cupAtSlot[sa] = cb;
    cupAtSlot[sb] = ca;
    slotOfCup[ca] = sb;
    slotOfCup[cb] = sa;
  });

  // 공은 처음 보여줄 때만 보이고, 컵이 덮는 순간 사라진다(그 뒤로는 컵이 옮겨다녀도 안 보인다)
  const ballFrames = [
    { offset: 0, opacity: 1 },
    { offset: Math.min(1, (placeMs * 0.94) / total), opacity: 1 },
    { offset: Math.min(1, placeMs / total), opacity: 0 },
    { offset: 1, opacity: 0 },
  ];

  return { frames, ballFrames, total, slotOfCup, cupAtSlot };
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 빨간 컵 (SVG 라서 어떤 배율에서도 선이 깔끔하다). 그림자는 정적으로 둔다 —
 * box-shadow 를 애니메이션하면 매 프레임 다시 그려야 해서 프레임이 떨어진다.
 */
function Cup({ index }) {
  const gradientId = `yabawi-cup-${index}`;
  return (
    <svg width={CUP_W} height={CUP_H} viewBox="0 0 92 74" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8574a" />
          <stop offset="55%" stopColor="#cf3529" />
          <stop offset="100%" stopColor="#a5241a" />
        </linearGradient>
      </defs>
      <path
        d="M24 7 Q46 1 68 7 L83 63 Q46 71 9 63 Z"
        fill={`url(#${gradientId})`}
        stroke="#7d1a12"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M31 10 Q34 38 38 64" stroke="rgba(255,255,255,0.32)" strokeWidth="5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 야바위 보드 — 대형 스크린과 참여자 폰이 같은 컴포넌트를 쓴다.
 * 서버가 준 plan 을 그대로 재생하므로 모든 화면이 같은 움직임을 보여준다.
 */
export default function CupShuffle({ plan, status, answerSlot, myPick, onPick, interactive = false }) {
  const boardRef = useRef(null);
  const wrapRef = useRef(null);
  const cupRefs = useRef([]);
  const ballRef = useRef(null);
  const animationsRef = useRef([]);
  const animatedKeyRef = useRef(null);
  const [scale, setScale] = useState(1);

  const cups = plan?.cups ?? 0;
  const boardW = cups * SLOT_W;

  // 화면 폭에 맞춰 보드를 통째로 축소한다 (컵이 SVG 라 흐려지지 않는다)
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !boardW) return undefined;

    const update = () => {
      const available = wrap.clientWidth;
      setScale(available > 0 ? Math.min(1, available / boardW) : 1);
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [boardW]);

  const stopAnimations = useCallback(() => {
    animationsRef.current.forEach((a) => a.cancel());
    animationsRef.current = [];
  }, []);

  // 컵을 지정한 자리에 즉시 놓는다 (애니메이션 없이) — 재접속·리렌더 복구용
  const placeInstantly = useCallback((slotOfCup, liftedCup = null) => {
    slotOfCup.forEach((slot, cup) => {
      const el = cupRefs.current[cup];
      if (el) el.style.transform = `translate3d(${slotX(slot)}px, ${liftedCup === cup ? -REVEAL_LIFT : 0}px, 0)`;
    });
  }, []);

  // 섞기 재생 — 판(round)이 새로 시작될 때 딱 한 번만 돈다.
  useEffect(() => {
    if (!plan) return undefined;

    const key = `${status}:${plan.initialBallIndex}:${plan.swaps.length}:${plan.swapDurationMs}`;
    if (status !== 'shuffling') return undefined;
    if (animatedKeyRef.current === key) return undefined;
    animatedKeyRef.current = key;

    const timeline = buildTimeline(plan);

    if (prefersReducedMotion()) {
      // 동작 줄이기 설정에서는 섞는 과정을 보여주지 않고 결과 배치로 바로 놓는다 (§14)
      stopAnimations();
      placeInstantly(timeline.slotOfCup);
      if (ballRef.current) ballRef.current.style.opacity = '0';
      return undefined;
    }

    stopAnimations();

    const options = { duration: timeline.total, fill: 'forwards', easing: 'linear' };
    const running = [];

    timeline.frames.forEach((keyframes, cup) => {
      const el = cupRefs.current[cup];
      if (!el) return;
      const animation = el.animate(keyframes, options);
      // 끝난 뒤에도 그 자리에 그대로 있어야 하므로, 인라인 스타일로 최종 위치를 먼저 박고
      // 나서 애니메이션을 걷어낸다 (같은 태스크 안이라 중간에 튀지 않는다).
      animation.onfinish = () => {
        el.style.transform = `translate3d(${slotX(timeline.slotOfCup[cup])}px, 0, 0)`;
        animation.cancel();
      };
      running.push(animation);
    });

    if (ballRef.current) {
      const ballAnimation = ballRef.current.animate(timeline.ballFrames, options);
      ballAnimation.onfinish = () => {
        if (ballRef.current) ballRef.current.style.opacity = '0';
        ballAnimation.cancel();
      };
      running.push(ballAnimation);
    }

    animationsRef.current = running;
    return undefined;
  }, [plan, status, stopAnimations, placeInstantly]);

  // 섞기가 끝난 뒤의 화면(고르기·결과)에서 컵 자리를 맞춰 둔다. 결과 단계에서는
  // 정답 컵을 들어 공을 보여준다 (CSS transition 이 부드럽게 처리).
  useLayoutEffect(() => {
    if (!plan) return;
    if (status === 'shuffling') return;

    const { cupAtSlot, slotOfCup } = resolveFinalPositions(plan);
    const revealing = status === 'result' || status === 'ended';
    placeInstantly(slotOfCup, revealing && answerSlot != null ? cupAtSlot[answerSlot] : null);
  }, [plan, status, answerSlot, placeInstantly]);

  useEffect(() => stopAnimations, [stopAnimations]);

  if (!plan) return null;

  const revealing = (status === 'result' || status === 'ended') && answerSlot != null;
  const ballSlot = revealing ? answerSlot : plan.initialBallIndex;

  return (
    <div className="yabawi-board-wrap" ref={wrapRef}>
      <div
        className={`yabawi-board${status === 'shuffling' ? ' yabawi-board--shuffling' : ''}`}
        ref={boardRef}
        style={{ width: boardW, height: BOARD_H, transform: `scale(${scale})` }}
      >
        {/* 공 — 처음 보여줄 때와 정답 공개 때만 보인다 */}
        <div
          ref={ballRef}
          className="yabawi-ball"
          style={{
            transform: `translate3d(${slotX(ballSlot)}px, 0, 0)`,
            opacity: revealing ? 1 : status === 'shuffling' ? 1 : 0,
          }}
          aria-hidden="true"
        />

        {Array.from({ length: cups }, (_, cup) => (
          <div
            key={cup}
            ref={(el) => {
              cupRefs.current[cup] = el;
            }}
            className="yabawi-cup"
            style={{ transform: `translate3d(${slotX(cup)}px, 0, 0)` }}
          >
            <Cup index={cup} />
          </div>
        ))}

        {/* 고르는 자리 — 컵이 아니라 "자리"를 누르는 것이라 섞기와 무관하게 고정이다 */}
        {Array.from({ length: cups }, (_, slot) => {
          const picked = myPick === slot;
          const isAnswer = revealing && answerSlot === slot;
          return (
            <button
              key={slot}
              type="button"
              className={`yabawi-slot${picked ? ' yabawi-slot--picked' : ''}${isAnswer ? ' yabawi-slot--answer' : ''}`}
              style={{ transform: `translate3d(${slotX(slot)}px, 0, 0)` }}
              onClick={interactive ? () => onPick?.(slot) : undefined}
              disabled={!interactive}
              aria-label={`${slot + 1}번 자리${picked ? ' (선택함)' : ''}`}
            >
              <span className="yabawi-slot__num">{slot + 1}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
