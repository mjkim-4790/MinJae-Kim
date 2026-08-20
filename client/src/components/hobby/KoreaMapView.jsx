import { useId } from 'react';

import { KOREA_MAP_VIEWBOX, KOREA_REGION_BY_NAME, KOREA_REGIONS } from '../../lib/koreaMap.js';

const WISH_COLOR = '#e8b923'; // 가보고 싶어요 — 노란 크레파스
const VISITED_COLORS = { pink: '#d8608f', blue: '#3a7fc1' }; // 다녀왔어요

/** 여행장소 아이템들을 시/도별 대표 색으로 뭉친다 — 방문한 곳이 있으면 방문 색이
 * 우선(더 "완결된" 상태), 없으면 위시(노랑)만 있어도 칠한다. */
function computeRegionColors(items) {
  const colors = new Map();
  for (const item of items) {
    const regionId = KOREA_REGION_BY_NAME.get(item.location);
    if (!regionId) continue;
    if (item.visited) {
      colors.set(regionId, VISITED_COLORS[item.visitedColor] ?? VISITED_COLORS.pink);
    } else if (!colors.has(regionId)) {
      colors.set(regionId, WISH_COLOR);
    }
  }
  return colors;
}

/** 대한민국 시/도 지도 — 여행장소 리스트에 맞춰 노란/분홍/파랑 크레파스로 칠한다.
 * feTurbulence 로 채색을 살짝 왜곡해 크레파스 질감을 낸다. */
export default function KoreaMapView({ items }) {
  const filterId = useId();
  const regionColors = computeRegionColors(items);

  return (
    <svg viewBox={KOREA_MAP_VIEWBOX} className="korea-map" role="img" aria-label="대한민국 지도">
      <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.025 0.07" numOctaves="2" seed="7" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="5" />
      </filter>
      <g filter={`url(#${filterId})`}>
        {KOREA_REGIONS.map((r) => {
          const color = regionColors.get(r.id);
          return (
            <path
              key={r.id}
              d={r.d}
              className="korea-map__region"
              fill={color ?? 'none'}
              fillOpacity={color ? 0.8 : 0}
            />
          );
        })}
      </g>
    </svg>
  );
}
