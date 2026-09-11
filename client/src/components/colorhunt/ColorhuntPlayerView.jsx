import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

import CameraStage from '../camera/CameraStage.jsx';
import { useWakeLock } from '../../hooks/useWakeLock.js';
import { extractColor } from '../../lib/colorhunt.js';
import { springPop, springTap } from '../../lib/motionPresets.js';

// 안개는 잠깐 끼었다 걷힌다. 계속 떠 있으면 오류 메시지와 다를 게 없다.
const FOG_MS = 2600;

export default function ColorhuntPlayerView({ game }) {
  const { state, mine, dismissed, submit, ready, dismiss } = game;
  // 물건을 찾아다니는 동안은 화면을 안 만진다 — 자동 잠금이 걸리면 돌아와서
  // 잠금을 풀고 카메라를 다시 켜야 해서 그 사람만 한 라운드를 통째로 놓친다.
  useWakeLock(state.status === 'ready' || state.status === 'hunting');
  const [fog, setFog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lastSeen, setLastSeen] = useState(null); // 폰이 뽑은 색 (내가 뭘 찍었는지 보여준다)
  const fogTimer = useRef(null);

  useEffect(() => () => clearTimeout(fogTimer.current), []);

  const showFog = useCallback((message) => {
    clearTimeout(fogTimer.current);
    setFog(message);
    fogTimer.current = setTimeout(() => setFog(null), FOG_MS);
  }, []);

  const onCapture = useCallback(
    async (canvas) => {
      const found = extractColor(canvas);
      // 판정할 수 없는 프레임 — 시도 횟수에 넣지 않고 다시 찍게 한다.
      // 어두워서 못 찍은 걸 점수로 벌하면 안 된다.
      if (!found.ok) {
        showFog(found.fog);
        return;
      }
      // 제대로 찍혔으면 앞서 낀 안개는 바로 걷는다. 결과가 나왔는데 "너무 어두워요"가
      // 남아 있으면 방금 그게 반영된 건지 헷갈린다.
      clearTimeout(fogTimer.current);
      setFog(null);
      setLastSeen(found.hex);
      setBusy(true);
      await submit(found.hex);
      setBusy(false);
    },
    [submit, showFog],
  );

  if (state.status === 'idle') return null;

  // ── 종료 ──
  if (state.status === 'ended') {
    if (dismissed) return null;
    const top = state.ranking?.[0];
    return (
      <section className="panel stack">
        <h2 className="panel__title">색깔 사냥 — 종료</h2>
        <p className="rps-spectator">
          {state.roundCount}라운드 종료
          {top ? ` · 최고점 ${top.nickname} ${top.points}점` : ''}
        </p>
        <motion.button className="button" onClick={dismiss} whileTap={{ scale: 0.96 }} transition={springTap}>
          확인
        </motion.button>
      </section>
    );
  }

  // ── 시작 전 — 카메라를 미리 허용해둔다 ──
  if (state.status === 'ready') {
    return (
      <section className="panel stack ch-stage">
        <h2 className="panel__title">색깔 사냥 — 곧 시작합니다</h2>
        <CameraStage
          active
          onActive={ready}
          permissionTitle="카메라를 미리 켜두세요"
          permissionBody="진행자가 색을 부르면 바로 찍을 수 있어요. 사진은 저장되지도, 전송되지도 않습니다 — 폰 안에서 색만 읽습니다."
        />
        <p className="subtitle">준비가 끝나면 진행자가 첫 색을 부릅니다</p>
      </section>
    );
  }

  // ── 라운드 사이 ──
  if (state.status === 'closed') {
    return (
      <section className="panel stack ch-stage">
        <h2 className="panel__title">색깔 사냥 — {state.round}라운드 끝</h2>
        {mine?.passed ? (
          <p className="chairs-verdict chairs-verdict--safe">
            찾았어요! {mine.attempts}번 만에 · +{mine.points}점
          </p>
        ) : (
          <p className="chairs-verdict chairs-verdict--out">이번엔 못 찾았어요</p>
        )}
        <p className="subtitle">다음 색을 기다려주세요</p>
      </section>
    );
  }

  // ── 사냥 중 ──
  const target = state.target;
  return (
    <section className="panel stack ch-stage">
      <h2 className="panel__title">색깔 사냥 — {state.round}라운드</h2>

      <motion.div
        key={target?.id}
        className="ch-target"
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={springPop}
      >
        <span className="ch-target__chip" style={{ background: target?.swatch }} />
        <span className="ch-target__name">{target?.name} 찾아!</span>
      </motion.div>

      {mine?.passed ? (
        <>
          <motion.p
            className="chairs-verdict chairs-verdict--safe"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={springPop}
          >
            찾았어요! {mine.attempts}번 만에 · +{mine.points}점
          </motion.p>
          <p className="subtitle">다른 사람들을 기다리는 중…</p>
        </>
      ) : (
        <>
          <CameraStage
            active
            onActive={ready}
            onCapture={onCapture}
            busy={busy}
            fog={fog}
            shutterLabel="이 색 찍기"
            hint="네모 안에 물건을 가득 채우고 찍으세요"
            permissionTitle="카메라를 켜주세요"
            permissionBody="사진은 저장되지도, 전송되지도 않습니다 — 폰 안에서 색만 읽어 보냅니다."
          />

          {mine && !mine.passed && (
            <div className="ch-miss">
              <span className="ch-miss__chip" style={{ background: lastSeen ?? mine.hex }} />
              <span>
                이 색으로 보였어요 · {mine.attempts}번째 시도 — 다시 찍어도 됩니다
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
