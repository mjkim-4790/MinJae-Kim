// 의자 게임 소리 — 음원 파일 없이 Web Audio 로 만든다.
//
// 음원을 쓰지 않는 이유: 라이선스가 걸리고, 용량이 늘고, 오프라인 행사장에서
// 로딩에 실패하면 게임이 멈춘다. 합성이면 그런 위험이 없다.
//
// 브라우저는 사용자가 한 번 누르기 전에는 소리를 못 낸다(자동재생 정책).
// 그래서 unlock() 을 클릭 핸들러 안에서 불러야 한다.
//
// 소리는 대형화면에서만 낸다. 참여자 폰마다 소리가 나면 기기별 시차 때문에
// 호루라기가 여러 번 어긋나 들린다.

let ctx = null;
let musicTimer = null;
let musicGain = null;

/** 반드시 클릭/터치 핸들러 안에서 부를 것. */
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

function note(freq, startAt, durSec, gainValue, type = 'triangle') {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // 딱딱 끊기지 않게 짧은 어택·릴리스를 준다
  g.gain.setValueAtTime(0.0001, startAt);
  g.gain.exponentialRampToValueAtTime(gainValue, startAt + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + durSec);
  osc.connect(g);
  g.connect(musicGain ?? ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + durSec + 0.05);
}

// 도는 동안 흐르는 가벼운 반주 (장조 아르페지오 — 밝고 재촉하는 느낌)
const MELODY = [523.25, 659.25, 783.99, 659.25, 587.33, 783.99, 880.0, 783.99];
const STEP_SEC = 0.22;

/** 돌기 시작할 때 — 반주를 켠다. */
export function startMusic() {
  if (!isReady()) return;
  stopMusic();

  musicGain = ctx.createGain();
  musicGain.gain.value = 0.22;
  musicGain.connect(ctx.destination);

  let step = 0;
  let nextAt = ctx.currentTime + 0.05;

  // setInterval 로 소리를 내면 타이밍이 흔들린다. 조금 앞서 예약해두고
  // 주기적으로 더 채워 넣는 방식(look-ahead)이 오디오에서는 기본이다.
  const pump = () => {
    const horizon = ctx.currentTime + 0.4;
    while (nextAt < horizon) {
      note(MELODY[step % MELODY.length], nextAt, STEP_SEC * 0.9, 0.25);
      step += 1;
      nextAt += STEP_SEC;
    }
  };
  pump();
  musicTimer = setInterval(pump, 150);
}

export function stopMusic() {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  if (musicGain && ctx) {
    const g = musicGain;
    // 뚝 끊으면 '툭' 하는 잡음이 난다 — 아주 짧게 줄여서 끈다
    try {
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
      setTimeout(() => g.disconnect(), 200);
    } catch {
      g.disconnect();
    }
    musicGain = null;
  }
}

/** 호루라기 — 삑! (음악을 끄고 곧바로 분다) */
export function whistle() {
  if (!isReady()) return;
  stopMusic();

  const t0 = ctx.currentTime + 0.01;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
  out.gain.setValueAtTime(0.5, t0 + 0.42);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
  out.connect(ctx.destination);

  // 진짜 호루라기는 두 음이 살짝 어긋나 떨리고, 안에 든 콩 때문에 빠르게 흔들린다.
  // 그 둘을 흉내낸다: 살짝 다른 두 오실레이터 + 빠른 비브라토.
  const vibrato = ctx.createOscillator();
  const vibratoGain = ctx.createGain();
  vibrato.frequency.value = 22;
  vibratoGain.gain.value = 55;
  vibrato.connect(vibratoGain);

  [2180, 2620].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    vibratoGain.connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.8 : 0.45;
    osc.connect(g);
    g.connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.6);
  });

  vibrato.start(t0);
  vibrato.stop(t0 + 0.6);
}

/** 라운드가 끝났을 때 짧은 마무리음 */
export function endChime() {
  if (!isReady()) return;
  stopMusic();
  const t0 = ctx.currentTime + 0.02;
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.3;
  musicGain.connect(ctx.destination);
  [523.25, 659.25, 783.99].forEach((f, i) => note(f, t0 + i * 0.12, 0.3, 0.3));
}

export function dispose() {
  stopMusic();
  if (ctx) {
    ctx.close().catch(() => {});
    ctx = null;
  }
}
