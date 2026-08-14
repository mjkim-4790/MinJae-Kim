/**
 * 개인/팀 순위 목록. 팀전이면서 배정된 팀이 있으면 팀 합산 순위를,
 * 그 외에는 개인 순위를 보여준다 (§9 결정 — 팀 순위는 팀원 점수 합산).
 */
export default function RankingBoard({ participants, teamScores, mode, large }) {
  const listClass = `ranking-list${large ? ' ranking-list--large' : ''}`;
  const showTeams = mode === 'team' && teamScores?.length > 0;

  if (showTeams) {
    return (
      <ol className={listClass}>
        {teamScores.map((t, i) => (
          <li key={t.teamId} className="ranking-item">
            <span className="ranking-rank">{i + 1}</span>
            <span className="ranking-name">{t.teamId}팀 ({t.memberCount}명)</span>
            <span className="ranking-score">{t.total}점</span>
          </li>
        ))}
      </ol>
    );
  }

  if (!participants || participants.length === 0) {
    return <p className="subtitle">아직 참여자가 없습니다.</p>;
  }

  return (
    <ol className={listClass}>
      {participants.map((p, i) => (
        <li key={p.id} className="ranking-item">
          <span className="ranking-rank">{i + 1}</span>
          <span className="ranking-name">{p.nickname}</span>
          <span className="ranking-score">{p.score}점</span>
        </li>
      ))}
    </ol>
  );
}
