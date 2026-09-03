import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

import DollChase from './DollChase.jsx';
import { useMotion } from '../../hooks/useMotion.js';
import {
  APPROACH_SPEED,
  TAP_GAIN,
  clampPos,
  runnerColor,
  shakeToSpeed,
} from '../../lib/mugunghwa.js';
import { springPop, springTap } from '../../lib/motionPresets.js';

/** 영희를 맡은 참가자의 조작 화면. */
function DollControl({ game, state, setLight }) {
  const [busy, setBusy] = useState(false);
  const flip = async (green) => {
    setBusy(true);
    await setLight(green);
    setBusy(false);
  };

  // 도망 구간 — 이제 영희가 쫓아간다
  if (state.status === 'sprinting') return <DollChase game={game} />;

  if (state.status !== 'approaching') {
    return (
      <p className="subtitle">당신이 영희입니다. 라운드가 시작되면 조종할 수 있어요</p>
    );
  }

  return (
    <>
      <p className={`mg-light ${state.green ? 'mg-light--green' : 'mg-light--red'}`}>
        {state.green ? '등을 돌린 중 — 다들 다가옵니다' : '돌아본 중 — 움직이면 잡힙니다'}
      </p>
      <motion.button
        className={`button mg-doll-btn${state.green ? ' mg-doll-btn--turn' : ''}`}
        disabled={busy}
        onClick={() => flip(!state.green)}
        whileTap={{ scale: 0.96 }}
        transition={springTap}
      >
        {state.green ? '돌아보기!' : '다시 등 돌리기'}
      </motion.button>
      <p className="subtitle">
        빨리 돌았다 늦게 돌았다 하며 속이는 게 재미입니다. 등을 돌리면 대형화면에서 구호가
        나갑니다.
      </p>
    </>
  );
}

export default function MugunghwaPlayerView({ game, participantId }) {
  const { state, myPos, setMyPos, dismissed, serverTime, sendPos, setLight, reportReady, dismiss } =
    game;
  const motionSensor = useMotion();
  const posRef = useRef(0);
  const rafRef = useRef(null);
  const lastRef = useRef(0);
  const tapsRef = useRef(0);
  const [, tick] = useState(0);

  const me = state.runners?.find((r) => r.participantId === participantId);
  const isDoll = state.dollId != null && state.dollId === participantId;
  const inRound = !!me;
  const approaching = state.status === 'approaching';
  const sprinting = state.status === 'sprinting';
  const running = approaching || sprinting;

  // 허용이 끝나면 진행자가 준비 인원을 볼 수 있게 알린다
  const { granted } = motionSensor;
  useEffect(() => {
    if (granted) reportReady();
  }, [granted, reportReady]);

  const askMotion = useCallback(async () => {
    const ok = await motionSensor.request();
    if (ok) reportReady();
  }, [motionSensor, reportReady]);

  // 새 라운드가 시작되면 출발선으로
  useEffect(() => {
    if (state.status === 'approaching') {
      posRef.current = 0;
      tapsRef.current = 0;
    }
  }, [state.status, state.round]);

  // 남은 시간 표시를 위해 달리는 동안만 자주 다시 그린다
  useEffect(() => {
    if (!sprinting) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [sprinting]);

  // 움직임 루프 — 1단계는 흔들기, 2단계는 연타
  useEffect(() => {
    if (!running || !inRound || isDoll) return undefined;
    if (me?.caught || me?.home) return undefined;

    lastRef.current = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - lastRef.current) / 1000);
      lastRef.current = now;

      const shake = motionSensor.shakeRef.current;
      let pos = posRef.current;

      if (approaching) {
        // 초록불에만 나아간다. 빨간불에 움직이면 서버가 잡는다 (여기서는 안 나아갈 뿐).
        if (state.green) pos = clampPos(pos + shakeToSpeed(shake) * APPROACH_SPEED * dt);
      } else {
        // 몸을 돌려 출발선으로 — 두드린 만큼 되돌아간다
        const taps = tapsRef.current;
        tapsRef.current = 0;
        if (taps > 0) pos = clampPos(pos - taps * TAP_GAIN);
      }

      posRef.current = pos;
      setMyPos(pos);
      sendPos(pos, shake);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [running, approaching, inRound, isDoll, state.green, me?.caught, me?.home, motionSensor.shakeRef, sendPos, setMyPos]);

  if (state.status === 'idle' && state.round === 0) return null;

  if (state.status === 'ended') {
    if (dismissed) return null;
    const won = state.result?.survivors?.some((s) => s.id === participantId);
    return (
      <section className="panel stack">
        <h2 className="panel__title">무궁화꽃이 피었습니다 — 종료</h2>
        {won ? (
          <motion.p className="typing-final-banner" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={springPop}>
            🏆 최후의 1인! ({state.round}라운드)
          </motion.p>
        ) : (
          <p className="rps-spectator">
            우승: {state.result?.survivors?.map((s) => s.nickname).join(', ') || '없음'}
          </p>
        )}
        <motion.button className="button" onClick={dismiss} whileTap={{ scale: 0.96 }} transition={springTap}>
          확인
        </motion.button>
      </section>
    );
  }

  // 준비 단계 — 시작 전에 미리 허용을 받아둔다
  if (state.status === 'ready') {
    return (
      <section className="panel stack mg-stage">
        <h2 className="panel__title">무궁화꽃이 피었습니다 — 곧 시작합니다</h2>
        {motionSensor.granted ? (
          <p className="chairs-verdict chairs-verdict--safe">준비 완료! 시작을 기다려주세요</p>
        ) : (
          <>
            <p className="subtitle">
              폰을 손에 들고 <strong>흔들어서</strong> 앞으로 갑니다. 영희가 돌아봤을 때 움직이면
              탈락이에요. 시작 전에 움직임 감지를 미리 허용해두세요.
            </p>
            <button className="button" onClick={askMotion}>
              움직임 감지 허용하기
            </button>
            {motionSensor.error && <p className="error-text">{motionSensor.error}</p>}
            {!motionSensor.supported && (
              <p className="subtitle">
                이 기기는 움직임 센서가 없어 이 게임에 참여할 수 없습니다. 진행자에게 알려주세요.
              </p>
            )}
          </>
        )}
      </section>
    );
  }

  if (isDoll) {
    return (
      <section className="panel stack mg-stage">
        <h2 className="panel__title">당신이 영희입니다 🌺</h2>
        <DollControl game={game} state={state} setLight={setLight} />
        {state.status === 'result' && (
          <p className="subtitle">
            잡힌 사람 {state.result?.eliminated?.length ?? 0}명 · 살아남은 사람{' '}
            {state.result?.survivors?.length ?? 0}명
            {state.dollCatchCount > 0 && ` · 내가 쫓아가 잡은 사람 ${state.dollCatchCount}명 (+${state.dollCatchCount * 30}점)`}
          </p>
        )}
      </section>
    );
  }

  if (!inRound) {
    return (
      <section className="panel stack mg-stage">
        <h2 className="panel__title">무궁화꽃이 피었습니다</h2>
        <p className="rps-spectator">
          {state.eliminatedIds?.includes(participantId) ? '탈락해서 관전 중입니다.' : '관전 중입니다.'}
        </p>
      </section>
    );
  }

  const myColor = runnerColor(me?.colorIndex ?? 0);
  const msLeft = state.sprintEndsAt ? Math.max(0, state.sprintEndsAt - serverTime()) : 0;
  const pct = Math.round(myPos * 100);

  return (
    <section className="panel stack mg-stage">
      <h2 className="panel__title">
        무궁화꽃이 피었습니다 — {state.round}라운드
      </h2>

      {state.status === 'result' && (
        <p className={`chairs-verdict ${me.caught ? 'chairs-verdict--out' : me.home ? 'chairs-verdict--safe' : 'chairs-verdict--out'}`}>
          {me.caughtByDoll
            ? '영희에게 잡혔어요…'
            : me.caught
              ? '움직여서 잡혔어요…'
              : me.home
                ? '무사히 돌아왔어요!'
                : '시간 안에 못 돌아왔어요…'}
        </p>
      )}

      {state.status === 'idle' && state.round > 0 && (
        <p className="subtitle">다음 라운드를 기다리는 중…</p>
      )}

      {running && (
        <>
          {me.caught ? (
            <p className="chairs-verdict chairs-verdict--out">
              {me.caughtByDoll ? '영희에게 잡혔습니다!' : '잡혔습니다!'} 다음 라운드를 기다려요
            </p>
          ) : me.home ? (
            <p className="chairs-verdict chairs-verdict--safe">출발선 도착! 살았어요</p>
          ) : (
            <>
              {approaching && (
                <motion.p
                  key={state.green ? 'green' : 'red'}
                  className={`mg-light ${state.green ? 'mg-light--green' : 'mg-light--red'}`}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={springPop}
                >
                  {state.green ? '지금! 흔들어서 앞으로' : '멈춰!! 폰을 가만히'}
                </motion.p>
              )}

              {sprinting && (
                <>
                  <motion.p
                    className="mg-light mg-light--sprint"
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={springPop}
                  >
                    도망쳐! 연타로 출발선까지
                  </motion.p>
                  <p className="mg-countdown">{(msLeft / 1000).toFixed(1)}초</p>
                </>
              )}

              {/* 진행 막대 — 왼쪽이 출발선, 오른쪽이 영희 */}
              <div className="mg-bar">
                <div className="mg-bar__fill" style={{ width: `${pct}%`, background: myColor }} />
                <span className="mg-bar__doll">🌺</span>
              </div>
              <p className="subtitle mg-mycolor">
                <span className="mg-mycolor__dot" style={{ background: myColor }} />
                대형화면에서 내 캐릭터는 이 색이에요
              </p>

              {sprinting && (
                <button
                  type="button"
                  className="mg-tap"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    tapsRef.current += 1;
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  빨리 두드려요!
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
