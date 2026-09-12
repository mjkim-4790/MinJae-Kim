import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import CameraStage from '../camera/CameraStage.jsx';
import { useGestureRecognizer } from '../../hooks/useGestureRecognizer.js';
import { useWakeLock } from '../../hooks/useWakeLock.js';
import { analyze } from '../../lib/beatmap.js';
import {
  BLADE_LANDMARK,
  FLIGHT_SEC,
  SLICE_RADIUS,
  SLICE_SPEED_MIN,
  TRAIL_FRAMES,
  buildChart,
  fruitPosition,
  isSliceable,
  segmentHitsCircle,
} from '../../lib/fruit.js';
import { springPop } from '../../lib/motionPresets.js';

/**
 * 아이패드 화면 — 노래에 맞춰 날아오는 과일을 손으로 휘둘러 자른다.
 *
 * ── 시계는 오디오가 쥔다 ──────────────────────────────────────────────────
 * 과일 위치를 `performance.now()` 로 계산하면 몇 분 뒤에는 음악과 어긋난다.
 * 브라우저 타이머와 오디오 하드웨어가 서로 다른 클럭을 쓰기 때문이다. 그래서
 * `audioCtx.currentTime` 을 그대로 게임 시계로 쓴다 — 소리가 나는 그 시계다.
 *
 * ── 영상은 띄우지 않는다 ──────────────────────────────────────────────────
 * 대형 화면 앞에서 하는 게임이라 얼굴이 그대로 걸린다. 카메라는 돌리되 보여주는 건
 * 손끝이 지나간 자리(칼자국)뿐이다 — 실루엣·후출 가위바위보와 같은 방침이고,
 * 마침 그게 이 게임에 더 어울린다.
 *
 * ── 거울처럼 좌우를 뒤집는다 ──────────────────────────────────────────────
 * 오른손을 휘두르면 화면 오른쪽이 갈라져야 자연스럽다. 좌표를 읽는 순간 한 번만
 * 뒤집어서(1 - x) 그 뒤로는 전부 화면 좌표로 다룬다.
 */
export default function FruitScreenView({ state, live, sendChart, sendHit, finish }) {
  const active = state.status !== 'idle';
  const recognizer = useGestureRecognizer(active, { numHands: 2 });
  useWakeLock(active);

  const [camOn, setCamOn] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [songError, setSongError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [nowSec, setNowSec] = useState(0);

  const fileRef = useRef(null);
  const canvasRef = useRef(null);
  // 매 프레임 만지는 값은 ref 에 둔다. state 로 두면 초당 60번 리렌더가 돈다.
  const audioRef = useRef({ ctx: null, buffer: null, source: null, t0: 0, playSec: 0, startSec: 0 });
  const runRef = useRef({ chart: [], hit: new Set(), trails: [[], []], playing: false, finished: false, splashes: [] });

  const chart = state.chart ?? null;

  // 서버에서 차트가 오면(재접속 포함) 게임이 그걸 쓴다
  useEffect(() => {
    runRef.current.chart = chart ?? [];
  }, [chart]);

  // ── 곡 고르기 + 분석 ────────────────────────────────────────────────────
  const onPickSong = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setSongError(null);
      setAnalyzing(true);
      try {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        const ctx = audioRef.current.ctx ?? new Ctor();
        audioRef.current.ctx = ctx;
        if (ctx.state === 'suspended') await ctx.resume();

        const buf = await ctx.decodeAudioData(await file.arrayBuffer());
        const channels = [];
        for (let c = 0; c < buf.numberOfChannels; c += 1) channels.push(buf.getChannelData(c));

        // 분석은 메인 스레드를 1초 남짓 잡는다 (3분 곡 기준). 한 번뿐이라 그대로 둔다.
        const a = analyze(channels, buf.sampleRate);
        const built = buildChart({
          bpm: a.bpm,
          phaseSec: a.phaseSec,
          startSec: a.startSec,
          playSec: a.playSec,
          energy: a.energy,
          seed: Math.round(a.bpm * 1000) + seedFromName(file.name),
        });

        audioRef.current.buffer = buf;
        audioRef.current.startSec = a.startSec;
        audioRef.current.playSec = a.playSec;
        setMeta({
          name: file.name.replace(/\.[^.]+$/, ''),
          bpm: a.bpm,
          startSec: a.startSec,
          playSec: a.playSec,
          confidence: a.confidence,
          count: built.length,
        });

        const res = await sendChart({
          chart: built.map(({ t, x, type, kind, drift }) => ({ t, x, type, kind, drift })),
          songName: file.name.replace(/\.[^.]+$/, ''),
          bpm: a.bpm,
        });
        if (!res?.ok) setSongError('차트를 서버가 받지 못했어요 (다른 곡으로 해보세요)');
      } catch {
        setSongError('이 파일은 읽지 못했어요. mp3·m4a·wav 로 시도해 주세요.');
      } finally {
        setAnalyzing(false);
      }
    },
    [sendChart],
  );

  // ── 재생 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const a = audioRef.current;
    const run = runRef.current;
    if (state.status !== 'playing') {
      run.playing = false;
      if (a.source) {
        try { a.source.stop(); } catch { /* 이미 끝났으면 그만 */ }
        a.source = null;
      }
      return;
    }
    if (!a.ctx || !a.buffer || run.playing) return;

    run.playing = true;
    run.finished = false;
    run.hit = new Set();
    run.trails = [[], []];
    run.splashes = [];

    const src = a.ctx.createBufferSource();
    src.buffer = a.buffer;
    src.connect(a.ctx.destination);
    // 조금 뒤에 시작하도록 예약해야 첫 소리가 끊기지 않는다
    const when = a.ctx.currentTime + 0.12;
    src.start(when, a.startSec, a.playSec);
    a.source = src;
    a.t0 = when;
  }, [state.status]);

  // ── 캔버스 크기 ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const parent = canvas.parentElement;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, parent.clientWidth * dpr);
      canvas.height = Math.max(1, parent.clientHeight * dpr);
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(parent);
    return () => obs.disconnect();
  }, [camOn]);

  // ── 매 프레임 ───────────────────────────────────────────────────────────
  const onFrame = useCallback(
    (video, ts) => {
      const canvas = canvasRef.current;
      const a = audioRef.current;
      const run = runRef.current;
      if (!canvas) return;
      const ctx2d = canvas.getContext('2d');
      const W = canvas.width;
      const H = canvas.height;
      ctx2d.clearRect(0, 0, W, H);

      // 손끝 좌표 (거울처럼 좌우 반전)
      const res = recognizer.recognize(video, ts);
      const blades = (res?.hands ?? [])
        .map((lm) => lm?.[BLADE_LANDMARK])
        .filter(Boolean)
        .map((p) => ({ x: 1 - p.x, y: p.y }));

      // 궤적 갱신
      for (let h = 0; h < 2; h += 1) {
        const trail = run.trails[h] ?? (run.trails[h] = []);
        if (blades[h]) trail.push({ ...blades[h], ts });
        else trail.length = 0; // 손이 사라지면 궤적도 끊는다
        while (trail.length > TRAIL_FRAMES) trail.shift();
      }

      const playing = run.playing && a.ctx && a.t0;
      const t = playing ? a.ctx.currentTime - a.t0 : -1;

      // 자르기 판정 — 점이 아니라 선분으로 본다 (프레임 사이에 훌쩍 지나가도 잡히게)
      if (playing && t >= 0) {
        for (let h = 0; h < 2; h += 1) {
          const trail = run.trails[h];
          if (trail.length < 2) continue;
          const p1 = trail[trail.length - 1];
          const p0 = trail[trail.length - 2];
          const dt = Math.max(1, p1.ts - p0.ts) / 1000;
          const speed = Math.hypot(p1.x - p0.x, p1.y - p0.y) / dt;
          if (speed < SLICE_SPEED_MIN) continue; // 가만히 대고 있으면 안 잘린다

          for (let i = 0; i < run.chart.length; i += 1) {
            if (run.hit.has(i)) continue;
            const node = run.chart[i];
            if (!isSliceable(node, t)) continue;
            const pos = fruitPosition(node, t);
            if (!pos.visible) continue;
            if (!segmentHitsCircle(p0, p1, pos, SLICE_RADIUS)) continue;
            run.hit.add(i);
            run.splashes.push({ x: pos.x, y: pos.y, born: ts, bomb: node.type === 'bomb' });
            sendHit(i, Math.round((t - node.t) * 1000));
          }
        }
      }

      // 그리기 — 과일
      if (playing && t >= 0) {
        for (let i = 0; i < run.chart.length; i += 1) {
          if (run.hit.has(i)) continue;
          const node = run.chart[i];
          const pos = fruitPosition(node, t);
          if (!pos.visible) continue;
          const size = Math.min(W, H) * 0.11;
          ctx2d.save();
          ctx2d.font = `${size}px serif`;
          ctx2d.textAlign = 'center';
          ctx2d.textBaseline = 'middle';
          // 칠 수 있는 순간에 살짝 빛난다 — 언제 휘둘러야 하는지 눈으로 알려준다
          if (isSliceable(node, t)) {
            ctx2d.shadowColor = node.type === 'bomb' ? '#ff5a5a' : '#ffe680';
            ctx2d.shadowBlur = size * 0.5;
          }
          ctx2d.fillText(node.kind || (node.type === 'bomb' ? '💣' : '🍎'), pos.x * W, pos.y * H);
          ctx2d.restore();
        }
      }

      // 그리기 — 터진 자국
      run.splashes = run.splashes.filter((s) => ts - s.born < 420);
      for (const s of run.splashes) {
        const age = (ts - s.born) / 420;
        const r = Math.min(W, H) * (0.05 + age * 0.09);
        ctx2d.save();
        ctx2d.globalAlpha = 1 - age;
        ctx2d.strokeStyle = s.bomb ? '#ff5a5a' : '#ffd24a';
        ctx2d.lineWidth = Math.min(W, H) * 0.012;
        ctx2d.beginPath();
        ctx2d.arc(s.x * W, s.y * H, r, 0, Math.PI * 2);
        ctx2d.stroke();
        ctx2d.restore();
      }

      // 그리기 — 칼자국
      for (const trail of run.trails) {
        if (trail.length < 2) continue;
        ctx2d.save();
        ctx2d.lineCap = 'round';
        ctx2d.lineJoin = 'round';
        for (let i = 1; i < trail.length; i += 1) {
          const f = i / trail.length;
          ctx2d.globalAlpha = f * 0.9;
          ctx2d.lineWidth = Math.min(W, H) * 0.016 * f;
          ctx2d.strokeStyle = '#ffffff';
          ctx2d.beginPath();
          ctx2d.moveTo(trail[i - 1].x * W, trail[i - 1].y * H);
          ctx2d.lineTo(trail[i].x * W, trail[i].y * H);
          ctx2d.stroke();
        }
        ctx2d.restore();
      }

      // 곡이 끝났는가 — 마지막 과일이 지나가고 조금 더 기다렸다가 마무리한다
      if (playing && !run.finished && run.chart.length > 0) {
        const lastT = run.chart[run.chart.length - 1].t;
        if (t > lastT + FLIGHT_SEC) {
          run.finished = true;
          run.playing = false;
          finish();
        }
      }

      // 진행 표시는 초당 몇 번이면 충분하다
      if (playing && t >= 0) setNowSec((prev) => (Math.abs(prev - t) > 0.2 ? t : prev));
    },
    [recognizer, sendHit, finish],
  );

  // ── 화면 ────────────────────────────────────────────────────────────────
  if (state.status === 'ended') {
    return (
      <div className="screen__center">
        <p className="screen__eyebrow">리듬 과일 자르기 — 종료</p>
        <p className="mg-screen__big">🍉</p>
        <p className="screen__hint">{state.doneCount}명이 도전했어요</p>
        {state.ranking?.length > 0 && (
          <ul className="fruit-rank">
            {state.ranking.slice(0, 8).map((r, i) => (
              <li key={r.participantId} className="fruit-rank__row">
                <span className="fruit-rank__no">{i + 1}</span>
                <span className="fruit-rank__name">{r.nickname}</span>
                <span className="fruit-rank__pt">{r.points}점</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const result = state.lastResult;
  const total = audioRef.current.playSec || 1;

  return (
    <div className="screen__center fruit-screen">
      <p className="screen__eyebrow">
        리듬 과일 자르기
        {state.currentNickname ? ` — ${state.currentNickname}` : ''}
        {state.songName ? ` · ${state.songName}` : ''}
      </p>

      {/* 경기장. CameraStage 는 hideVideo 를 주면 프레임이 1×1px 로 숨으므로
          (영상이 대형 화면에 뜨지 않게 하는 장치다) 그 안에 캔버스를 넣으면 같이
          사라진다. 그래서 무대는 따로 두고, CameraStage 는 카메라를 돌려
          onFrame 을 먹여주는 역할만 한다 — 후출 가위바위보와 같은 구조다. */}
      {camOn && (
        <div className="fruit-stage">
          <canvas ref={canvasRef} className="fruit-canvas" aria-hidden="true" />
        </div>
      )}

      <CameraStage
        active={active}
        facingMode="user"
        hideVideo
        onActive={() => setCamOn(true)}
        onFrame={onFrame}
        permissionTitle="아이패드 카메라를 켜주세요"
        permissionBody="손 모양만 읽습니다. 영상은 화면에 뜨지도, 저장되지도, 어디로 전송되지도 않습니다."
      />

      {state.status === 'playing' && (
        <div className="fruit-hud">
          <span className="fruit-hud__score">{live?.score ?? 0}점</span>
          {(live?.combo ?? 0) >= 2 && <span className="fruit-hud__combo">{live.combo} 콤보</span>}
          <div className="fruit-hud__bar">
            <div className="fruit-hud__bar-fill" style={{ width: `${Math.max(0, Math.min(100, (nowSec / total) * 100))}%` }} />
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {state.status === 'ready' && (
          <motion.div key="ready" className="fruit-ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {!state.hasChart ? (
              <>
                <p className="pc-screen__big">먼저 노래를 고르세요</p>
                <p className="screen__hint">
                  이 아이패드에 있는 음원 파일을 고르면 박자를 분석합니다.
                  <strong> 파일은 이 기기 밖으로 나가지 않습니다.</strong>
                </p>
                <input ref={fileRef} type="file" accept="audio/*" className="cam-file-input" onChange={onPickSong} />
                <button type="button" className="button" disabled={analyzing} onClick={() => fileRef.current?.click()}>
                  {analyzing ? '박자 분석 중…' : '노래 고르기'}
                </button>
                {songError && <p className="error-text">{songError}</p>}
              </>
            ) : (
              <>
                <p className="pc-screen__big">
                  {state.currentNickname ? `${state.currentNickname} 나오세요!` : '다음 사람을 기다리는 중'}
                </p>
                <p className="screen__hint">
                  {meta
                    ? `${meta.name} · ${Math.round(meta.bpm)} BPM · ${meta.playSec}초 · 과일 ${meta.count}개`
                    : `${state.songName ?? '노래 준비됨'} · ${state.bpm ?? '?'} BPM`}
                </p>
                {meta && meta.confidence < 0.5 && (
                  <p className="fruit-warn">박자가 또렷하지 않은 곡이에요. 다른 곡이 더 잘 맞을 수 있어요.</p>
                )}
                <input ref={fileRef} type="file" accept="audio/*" className="cam-file-input" onChange={onPickSong} />
                <button type="button" className="button button--ghost" disabled={analyzing} onClick={() => fileRef.current?.click()}>
                  {analyzing ? '분석 중…' : '다른 노래로 바꾸기'}
                </button>
              </>
            )}
          </motion.div>
        )}

        {state.status === 'result' && result && (
          <motion.div key="result" className="fruit-result" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springPop}>
            <p className="pc-screen__big">{result.nickname}</p>
            <p className="fruit-result__score">{result.score}점</p>
            <p className="screen__hint">
              {result.sliced}/{result.total}개 · 최고 {result.maxCombo}콤보
              {result.bombs > 0 ? ` · 폭탄 ${result.bombs}번` : ''}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {camOn && !recognizer.ready && (
        <p className="screen__hint">{recognizer.loading ? '손 인식 준비 중…' : recognizer.error}</p>
      )}
    </div>
  );
}

/** 파일마다 다른(그러나 같은 파일이면 늘 같은) 씨앗 — 곡이 같으면 차트도 같아야 공평하다. */
function seedFromName(name = '') {
  let s = 0;
  for (let i = 0; i < name.length; i += 1) s = (s * 31 + name.charCodeAt(i)) & 0xffff;
  return s;
}
