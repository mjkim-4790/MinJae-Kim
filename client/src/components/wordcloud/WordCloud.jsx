import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { createMeasurer, layoutWords } from '../../lib/wordcloud.js';

const FONT_FAMILY = "'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif";

// 1위부터 순서대로 쓰는 색. 앞쪽일수록 진하고 채도가 높다 — 크기만이 아니라
// 색으로도 순위가 읽히게 (작은 글자가 흐린 회색이면 대형화면에서 안 보인다).
const TONES = [
  'var(--rainbow-red)',
  'var(--button-bg)',
  'var(--rainbow-blue)',
  'var(--rainbow-green)',
  'var(--rainbow-purple)',
  'var(--rainbow-pink)',
];

function toneFor(rank) {
  return TONES[rank % TONES.length];
}

/**
 * 단어 구름 그리기 — 대형스크린과 참여자 폰이 같은 컴포넌트를 쓴다.
 *
 * 실시간으로 자라는 게임이라, 갱신될 때 이미 놓인 단어가 튀지 않는 게 핵심이다.
 * 배치는 lib/wordcloud.js 가 0~1 비율로 돌려주고, 여기서는 transform 으로만 옮긴다
 * (레이아웃·페인트를 다시 하지 않으므로 갱신이 잦아도 버티고, 화면 크기가 바뀌어도
 * 같은 구도가 유지된다).
 */
export default function WordCloud({ words, emptyText = '아직 올라온 단어가 없어요' }) {
  const wrapRef = useRef(null);
  const measureRef = useRef(null);
  const previousRef = useRef(new Map()); // word -> 직전 배치(자리 지키기용)
  const [board, setBoard] = useState({ width: 0, height: 0 });

  if (!measureRef.current && typeof document !== 'undefined') {
    measureRef.current = createMeasurer(FONT_FAMILY);
  }

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;

    const update = () => setBoard({ width: wrap.clientWidth, height: wrap.clientHeight });
    update();

    const observer = new ResizeObserver(update);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  const placed = useMemo(() => {
    if (!board.width || !board.height || !measureRef.current) return [];
    const { placed: next } = layoutWords(words, measureRef.current, board, previousRef.current);
    return next;
  }, [words, board]);

  // 다음 갱신 때 자리를 지킬 수 있도록 이번 배치를 기억해 둔다.
  // (렌더 중에 ref 를 건드리면 StrictMode 이중 렌더에서 어긋나므로 커밋 후에 한다.)
  useEffect(() => {
    previousRef.current = new Map(placed.map((p) => [p.word, p]));
  }, [placed]);

  // 판이 비워지면(새 게임) 기억도 비운다
  useEffect(() => {
    if (words.length === 0) previousRef.current = new Map();
  }, [words.length]);

  // 색은 "몇 등인지"로 정한다. placed 배열의 순서는 자리 지키기 때문에 순위와
  // 다르므로, 서버가 준 words(횟수 내림차순) 기준으로 등수를 따로 구한다.
  const rankOf = useMemo(
    () => new Map(words.map((w, i) => [w.word, i])),
    [words],
  );

  return (
    <div className="wordcloud-board" ref={wrapRef}>
      {placed.length === 0 && <p className="wordcloud-empty">{emptyText}</p>}
      {placed.map((p) => (
        <span
          key={p.word}
          className="wordcloud-word"
          style={{
            transform: `translate3d(${p.xRatio * board.width}px, ${p.yRatio * board.height}px, 0) translate(-50%, -50%)`,
            fontSize: `${p.fontSize}px`,
            color: toneFor(rankOf.get(p.word) ?? 0),
          }}
          title={`${p.word} · ${p.count}회`}
        >
          {p.word}
        </span>
      ))}
    </div>
  );
}
