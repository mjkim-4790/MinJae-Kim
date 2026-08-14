import { AnimatePresence, motion } from 'motion/react';

import { springReorder } from '../lib/motionPresets.js';

/**
 * 개인/팀 순위 목록. 팀전이면서 배정된 팀이 있으면 팀 합산 순위를,
 * 그 외에는 개인 순위를 보여준다 (§9 결정 — 팀 순위는 팀원 점수 합산).
 * 순위가 바뀌면 카드가 제자리에서 스프링으로 재배열된다 (공간 일관성 + 몰입감).
 */
export default function RankingBoard({ participants, teamScores, mode, large }) {
  const listClass = `ranking-list${large ? ' ranking-list--large' : ''}`;
  const showTeams = mode === 'team' && teamScores?.length > 0;

  const items = showTeams
    ? teamScores.map((t) => ({
        key: `team-${t.teamId}`,
        name: `${t.teamId}팀 (${t.memberCount}명)`,
        score: t.total,
      }))
    : (participants ?? []).map((p) => ({ key: `p-${p.id}`, name: p.nickname, score: p.score }));

  if (!showTeams && items.length === 0) {
    return <p className="subtitle">아직 참여자가 없습니다.</p>;
  }

  return (
    <ol className={listClass}>
      <AnimatePresence initial={false}>
        {items.map((item, i) => (
          <motion.li
            key={item.key}
            layout
            transition={springReorder}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="ranking-item"
          >
            <span className="ranking-rank">{i + 1}</span>
            <span className="ranking-name">{item.name}</span>
            <span className="ranking-score">{item.score}점</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
