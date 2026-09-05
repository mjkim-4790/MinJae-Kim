// '무궁화꽃이 피었습니다' 효과음 — 음원 파일 없이 Web Audio 로 만든다.
// (의자 게임 chairsAudio.js 와 같은 방침: 라이선스·용량·오프라인 로딩 위험이 없다.)
//
// 드라마의 실제 음원은 저작권이 있어 쓸 수 없다. 대신 커다란 인형이 고개를 홱
// 돌리는 그 기계음을 직접 합성한다. 세 겹으로 쌓아야 '기계'처럼 들린다:
//   1) 모터가 돌아가는 낮은 회전음
//   2) 톱니바퀴가 점점 촘촘하게 걸리는 딸깍임
//   3) 끝까지 돌아가 걸리는 '쿵'
//
// 소리는 대형화면에서만 낸다 — 폰마다 나면 기기별 시차로 어긋나 들린다.

let ctx = null;
let noise = null;

/** 반드시 클릭/터치 핸들러 안에서 부를 것 (브라우저 자동재생 정책). */
export async function unlock() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return ctx.state === 'running';
}

export function isReady() {
  return !!ctx && ctx.state === 'running';
}

/** 백색잡음 한 덩이 — 딸깍임과 쿵에 쓴다. 한 번 만들어 계속 돌려쓴다. */
function noiseBuffer() {
  if (noise) return noise;
  const len = Math.floor(ctx.sampleRate * 0.25);
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  return noise;
}

/** 금속이 걸리는 짧은 딸깍 소리. */
function clack(at, gain, out, { freq = 2400, q = 7, dur = 0.02 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(0.02, gain), at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(out);
  src.start(at);
  src.stop(at + dur + 0.02);
}

/**
 * 영희가 고개를 홱 돌리는 소리.
 *
 * 빨간불로 바뀌는 순간에 낸다. 화면을 안 보고 있던 사람도 소리만으로 알아채야
 * 억울한 탈락이 줄어든다 — 분위기용이면서 동시에 게임 신호다.
 */
export function headTurn() {
  if (!isReady()) return;

  const t0 = ctx.currentTime + 0.01;
  const out = ctx.createGain();
  out.gain.value = 0.85;
  out.connect(ctx.destination);

  // 고개가 다 돌아가 걸리는 시각. 모터·톱니·쿵이 모두 이 시각을 향한다 —
  // 중간에 소리가 끊기면 한 동작이 아니라 딴 소리 두 개로 들린다.
  const stopAt = t0 + 0.23;

  // 1) 모터 — 낮은 톱니파가 확 돌다가 걸리는 순간 끊긴다
  const motor = ctx.createOscillator();
  motor.type = 'sawtooth';
  motor.frequency.setValueAtTime(70, t0);
  motor.frequency.exponentialRampToValueAtTime(195, t0 + 0.16);
  motor.frequency.exponentialRampToValueAtTime(90, stopAt);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 950;
  const motorGain = ctx.createGain();
  motorGain.gain.setValueAtTime(0.0001, t0);
  motorGain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.03);
  // 지수 감쇠는 앞부분이 뚝 떨어져서, 걸릴 때까지는 붙잡아 둔다
  motorGain.gain.setValueAtTime(0.3, stopAt - 0.02);
  motorGain.gain.exponentialRampToValueAtTime(0.0001, stopAt + 0.06);
  motor.connect(lp);
  lp.connect(motorGain);
  motorGain.connect(out);
  motor.start(t0);
  motor.stop(stopAt + 0.09);

  // 2) 톱니바퀴 — 간격이 점점 좁아지며 걸린다 (가속하는 느낌이 '기계'를 만든다)
  let at = t0 + 0.02;
  let gap = 0.032;
  for (let i = 0; i < 9; i += 1) {
    clack(at, 0.24 - i * 0.014, out);
    at += gap;
    gap *= 0.92;
  }

  // 3) 끝까지 돌아가 걸리는 쿵
  const thud = ctx.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(160, stopAt);
  thud.frequency.exponentialRampToValueAtTime(52, stopAt + 0.13);
  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.0001, stopAt);
  thudGain.gain.exponentialRampToValueAtTime(0.55, stopAt + 0.012);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, stopAt + 0.24);
  thud.connect(thudGain);
  thudGain.connect(out);
  thud.start(stopAt);
  thud.stop(stopAt + 0.28);
  clack(stopAt, 0.35, out, { freq: 1100, q: 3, dur: 0.06 });

  setTimeout(() => out.disconnect(), 900);
}

export function dispose() {
  if (ctx) {
    ctx.close().catch(() => {});
    ctx = null;
    noise = null;
  }
}
