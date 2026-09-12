// 음원에서 박자를 찾아 '과일이 날아올 시각표'를 만든다.
//
// ── 왜 실시간이 아니라 사전 분석인가 ──────────────────────────────────────
// 과일은 던져진 뒤 날아오는 시간이 필요하다. 비트가 울린 순간에 던지면 이미 늦다.
// 그래서 박자를 **미리** 알아야 하고, 실시간 감지로는 원리상 불가능하다.
// 곡을 고르는 순간 한 번 분석해서 시각표를 만들어두고, 재생 중에는 그걸 따라간다.
//
// ── 외부 라이브러리도 API 도 쓰지 않는다 ──────────────────────────────────
// FFT 부터 직접 짠다. 요청당 과금이 붙는 구조를 전부 배제한다는 방침 때문이기도 하고,
// 행사장 와이파이가 끊겨도 돌아가야 하기 때문이기도 하다.

// ── FFT (radix-2, 제자리 계산) ────────────────────────────────────────────

/** 길이가 2의 거듭제곱인 re/im 배열을 제자리에서 FFT 한다. */
export function fft(re, im) {
  const n = re.length;
  // 비트 반전 순서로 재배치
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// ── 1단계: 온셋 포락선 (소리가 '탁' 하고 시작하는 지점의 세기) ────────────

export const TARGET_RATE = 22050; // 박자 찾기엔 이걸로 충분하다 (계산량 절반)
export const FFT_SIZE = 1024;
export const HOP = 256; // 약 11.6ms 해상도

/** 스테레오·임의 표본율을 22050Hz 모노로 줄인다. */
export function toMono(channels, sampleRate, targetRate = TARGET_RATE) {
  const ratio = sampleRate / targetRate;
  const outLen = Math.floor(channels[0].length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const src = Math.floor(i * ratio);
    let sum = 0;
    for (const ch of channels) sum += ch[src];
    out[i] = sum / channels.length;
  }
  return out;
}

/**
 * 스펙트럴 플럭스 — 주파수 성분이 '늘어난' 양만 더한다.
 * 줄어든 건 무시하는 게 핵심이다. 소리가 잦아드는 건 박자가 아니다.
 */
export function onsetEnvelope(mono, sampleRate = TARGET_RATE) {
  const frames = Math.max(0, Math.floor((mono.length - FFT_SIZE) / HOP) + 1);
  const env = new Float32Array(frames);
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const win = new Float64Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i += 1) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)); // Hann
  }
  const bins = FFT_SIZE / 2;
  let prev = new Float64Array(bins);

  for (let f = 0; f < frames; f += 1) {
    const off = f * HOP;
    for (let i = 0; i < FFT_SIZE; i += 1) {
      re[i] = mono[off + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    let flux = 0;
    const cur = new Float64Array(bins);
    for (let b = 0; b < bins; b += 1) {
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      cur[b] = mag;
      const d = mag - prev[b];
      if (d > 0) flux += d;
    }
    env[f] = flux;
    prev = cur;
  }

  // 이동평균을 빼서 곡 전체 음량 변화를 지운다 (조용한 구간의 박자도 살린다)
  const w = 16;
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(frames - 1, i + w); j += 1) {
      sum += env[j];
      n += 1;
    }
    out[i] = Math.max(0, env[i] - sum / n);
  }
  return { env: out, hopSec: HOP / sampleRate };
}

// ── 2단계: 템포 추정 ──────────────────────────────────────────────────────

export const MIN_BPM = 70;
export const MAX_BPM = 190;
// 가장 잘 맞는 후보의 이 비율 이상이면 '이 주기도 박자가 맞는다'고 본다
const GRID_KEEP = 0.85;

/** 포락선을 소수 위치에서 읽는다 (위상을 프레임보다 잘게 맞추려면 필요하다). */
function sampleEnv(env, t) {
  if (t < 0 || t >= env.length - 1) return 0;
  const i = Math.floor(t);
  const f = t - i;
  return env[i] * (1 - f) + env[i + 1] * f;
}

/** 주기(프레임, 소수 가능)를 주면 온셋이 격자에 얹히는 평균 세기와 그때의 위상. */
function gridScore(env, period, phaseStep = 0.25) {
  let best = 0;
  let bestPhase = 0;
  for (let p = 0; p < period; p += phaseStep) {
    let sum = 0;
    let n = 0;
    for (let t = p; t < env.length - 1; t += period) {
      sum += sampleEnv(env, t);
      n += 1;
    }
    const s = n > 0 ? sum / n : 0;
    if (s > best) {
      best = s;
      bestPhase = p;
    }
  }
  return { score: best, phase: bestPhase };
}

/** lag(프레임) 별 자기상관. 겹치는 길이로 나누므로 lag 이 길어져도 불리하지 않다. */
function autocorrelation(env, maxLag) {
  const acf = new Float64Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag += 1) {
    const n = env.length - lag;
    if (n <= 0) break;
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += env[i] * env[i + lag];
    acf[lag] = sum / n;
  }
  return acf;
}

/** 자기상관으로 대략의 주기를 잡는다. 옥타브는 여기서 맞히지 못한다 — 다음 단계 몫. */
function coarseLag(env, hopSec) {
  const minLag = Math.max(2, Math.floor(60 / MAX_BPM / hopSec));
  const maxLag = Math.ceil(60 / MIN_BPM / hopSec);
  const acf = autocorrelation(env, maxLag);
  let best = minLag;
  let bestScore = -1;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    // 사람이 느끼는 템포가 120 근처에 몰린다는 점을 가중치로. 로그 거리라 60↔240 대칭.
    const w = Math.exp(-0.5 * (Math.log2(60 / (lag * hopSec) / 120) / 0.9) ** 2);
    const s = acf[lag] * w;
    if (s > bestScore) {
      bestScore = s;
      best = lag;
    }
  }
  return best;
}

// 과일이 초당 두 개쯤 올 때가 가장 칠 만하다 (한 사람이 양손으로 감당 가능한 속도)
export const TARGET_BPM = 130;

/**
 * 배수/약수 관계인 후보 중 목표 속도에 가장 가까운 것을 고른다.
 *
 * ── 왜 '음악적으로 맞는 BPM' 을 안 찾는가 ─────────────────────────────────
 * 두 번 시도했다가 둘 다 틀렸다. 자기상관 크기로도, 격자 평균 세기로도,
 * 짝/홀 균일도로도 갈리지 않는다 — 실측해보면 정답과 오답의 지표가 아예 겹치거나
 * 뒤집힌다(정답의 균일도 0.18~0.21 < 오답 0.37~0.40). 보통의 편곡에서 스네어는
 * 2·4박에만 들어가고 온셋 검출에서 킥보다 훨씬 크게 잡히므로, '두 박 주기' 가
 * 진짜 박보다 뚜렷해 보이는 게 정상이다. 이건 휴리스틱으로 덮을 문제가 아니다.
 *
 * ── 그런데 이 게임엔 애초에 필요가 없다 ───────────────────────────────────
 * 절반이든 두 배든 **전부 박자 위**다. 과일이 음악에 맞아 떨어지기만 하면 되고,
 * 실제로 중요한 건 '초당 몇 개가 오느냐' 다. 그래서 음악 이론이 아니라 칠 만한
 * 속도를 기준으로 배수를 고른다. 어차피 진행자에게 ×2 / ÷2 를 쥐어준다.
 */
export function toPlayableOctave(bpm, target = TARGET_BPM) {
  let best = null;
  for (let k = -2; k <= 2; k += 1) {
    const b = bpm * 2 ** k;
    if (b < MIN_BPM || b > MAX_BPM) continue;
    if (best === null || Math.abs(Math.log2(b / target)) < Math.abs(Math.log2(best / target))) {
      best = b;
    }
  }
  return best ?? bpm;
}

/**
 * BPM 과 위상을 추정한다.
 *
 * 자기상관으로 주기를 잡고(배수 관계 안에서는 늘 맞는다), 칠 만한 배수로 옮긴 뒤,
 * 격자를 촘촘히 재조율한다. 마지막 단계가 제일 중요하다 — **1 BPM 만 틀려도
 * 75초 뒤에는 반 박이 밀린다.**
 */
export function estimateTempo(env, hopSec) {
  const coarse = 60 / (coarseLag(env, hopSec) * hopSec);
  const grid = refineGrid(env, hopSec, toPlayableOctave(coarse));

  // 박자가 또렷한 곡인지 — 격자 위 평균이 전체 평균보다 얼마나 솟았는가.
  // 낮으면 리듬이 흐릿한 곡이라 진행자에게 다른 곡을 권한다.
  let sum = 0;
  for (let i = 0; i < env.length; i += 1) sum += env[i];
  const overall = env.length ? sum / env.length : 0;

  return {
    bpm: grid.bpm,
    phaseSec: grid.phaseSec,
    confidence: grid.score > 0 ? Math.max(0, Math.min(1, 1 - overall / grid.score)) : 0,
  };
}

/**
 * 격자(BPM·위상)를 미세 조정한다.
 *
 * **1 BPM 만 틀려도 75초 뒤에는 반 박이 밀린다** — 곡 뒷부분에서 과일이 박자와
 * 따로 논다. 그래서 온셋이 격자에 얼마나 잘 얹히는지를 직접 재서 최적점을 찾는다.
 *
 * ── 두 번 훑는 이유 ───────────────────────────────────────────────────────
 * 한 번만 훑으면 해상도가 **빠른 템포에 불리하다.** 같은 상대 오차라도 주기가
 * 짧으면 한 주기에서 차지하는 비중이 커져 격자가 더 많이 흐트러지기 때문이다.
 * 그 탓에 175BPM 이 87.5BPM 보다 점수가 낮게 나와 옥타브 판정이 뒤집혔다
 * (160→80 도 같은 원인). 좁게 한 번 더 훑어서 양쪽에 같은 조건을 준다.
 */
export function refineGrid(env, hopSec, bpmGuess, { span = 0.05, steps = 81 } = {}) {
  const sweep = (center, halfWidth, n) => {
    let best = { bpm: center, phaseSec: 0, score: -1 };
    for (let i = 0; i < n; i += 1) {
      const bpm = center * (1 - halfWidth + (2 * halfWidth * i) / (n - 1));
      const g = gridScore(env, 60 / bpm / hopSec);
      if (g.score > best.score) best = { bpm, phaseSec: g.phase * hopSec, score: g.score };
    }
    return best;
  };

  const coarse = sweep(bpmGuess, span, steps);
  // 1차에서 쓴 한 칸 폭만큼만 다시, 훨씬 촘촘하게
  return sweep(coarse.bpm, (2 * span) / (steps - 1), 161);
}

// ── 3단계: 신나는 구간 찾기 ───────────────────────────────────────────────

/** 1초 단위 음량(RMS) 곡선. */
export function energyCurve(mono, sampleRate = TARGET_RATE) {
  const win = sampleRate;
  const n = Math.floor(mono.length / win);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    for (let j = 0; j < win; j += 1) {
      const v = mono[i * win + j];
      sum += v * v;
    }
    out[i] = Math.sqrt(sum / win);
  }
  return out;
}

/**
 * 가장 신나는 구간의 시작 시각(초).
 * 후렴을 정확히 짚는 건 아니고 '제일 꽉 찬 구간'을 고르는 것이다 — 가요에선
 * 대개 그게 후렴이다. 진행자가 눈으로 보고 옮길 수 있게 해둔다.
 */
export function findHighlight(energy, windowSec = 75) {
  if (energy.length <= windowSec) return 0;
  let best = 0;
  let bestSum = -1;
  let sum = 0;
  for (let i = 0; i < windowSec; i += 1) sum += energy[i];
  bestSum = sum;
  for (let i = windowSec; i < energy.length; i += 1) {
    sum += energy[i] - energy[i - windowSec];
    if (sum > bestSum) {
      bestSum = sum;
      best = i - windowSec + 1;
    }
  }
  return best;
}

// ── 4단계: 엮기 ───────────────────────────────────────────────────────────

export const HIGHLIGHT_SEC = 75;

/** 시작 시각과 끝 시각 사이의 비트 시각 목록 (초). */
export function beatTimes(bpm, phaseSec, untilSec, fromSec = 0) {
  const step = 60 / bpm;
  const out = [];
  // 위상은 곡 전체 기준이므로, fromSec 이전의 박은 건너뛴다
  let t = phaseSec;
  if (t < fromSec) t += Math.ceil((fromSec - t) / step) * step;
  for (; t < untilSec; t += step) out.push(t);
  return out;
}

/**
 * 곡 하나를 분석해 '어디서부터 몇 BPM 으로 틀지' 를 정한다.
 *
 * 곡 전체가 아니라 **실제로 쓸 구간만** 온셋 분석을 돌린다. 두 가지를 같이 얻는다:
 *   · 3~4분 곡에서 FFT 를 몇 배 덜 돌린다 (아이패드에서 기다리는 시간)
 *   · 격자를 그 구간에 딱 맞춰 조율하게 된다 — 곡 전체 평균에 맞추면 정작 트는
 *     구간에서 조금씩 밀린다
 */
export function analyze(channels, sampleRate, { windowSec = HIGHLIGHT_SEC } = {}) {
  const mono = toMono(channels, sampleRate);
  const durationSec = mono.length / TARGET_RATE;
  const energy = energyCurve(mono);

  const useSec = Math.max(1, Math.min(windowSec, Math.floor(durationSec)));
  const startSec = findHighlight(energy, useSec);
  const seg = mono.subarray(startSec * TARGET_RATE, (startSec + useSec) * TARGET_RATE);

  const { env, hopSec } = onsetEnvelope(seg);
  const tempo = estimateTempo(env, hopSec);
  const grid = refineGrid(env, hopSec, tempo.bpm);

  return {
    bpm: grid.bpm,
    // 위상은 구간 시작 기준으로 쟀으므로 곡 전체 기준으로 옮긴다
    phaseSec: startSec + grid.phaseSec,
    confidence: tempo.confidence,
    startSec,
    playSec: useSec,
    durationSec,
    energy,
  };
}
