import { Router } from 'express';

import { requireOperator } from '../auth/middleware.js';
import {
  createHobbyItem,
  deleteHobbyItem,
  getHobbyItem,
  listHobbyItemsByCategory,
  updateHobbyItem,
} from '../db/hobbyItems.js';

export const hobbyRouter = Router();
hobbyRouter.use(requireOperator);

const CATEGORIES = new Set(['cafe', 'restaurant', 'travel', 'book', 'music', 'movie']);
// 위치 있는 카테고리만 location/hours 를 받는다 — 책/음악/영화는 그런 개념이 없다.
const HAS_LOCATION = new Set(['cafe', 'restaurant', 'travel']);
// 여행장소의 location 은 지도에 올려야 해서 자유 텍스트가 아니라 17개 시/도 중
//하나로 고정한다 (사용자 결정 — 시/도 단위 직접 매칭, 외부 지오코딩 API 없이).
const SIDO_NAMES = new Set([
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
]);

function toPublicItem(item) {
  return {
    id: item.id,
    category: item.category,
    name: item.name,
    location: item.location,
    hours: item.hours,
    rating: item.rating,
    review: item.review,
    visited: Boolean(item.visited),
    visitedColor: item.visited_color,
    updatedAt: item.updated_at,
  };
}

function parsePayload(req, category) {
  const name = String(req.body?.name ?? '').trim().slice(0, 60);
  const rating = Math.max(0, Math.min(5, Number(req.body?.rating) || 0));
  const review = String(req.body?.review ?? '').trim().slice(0, 1000);

  let location = null;
  let hours = null;
  if (HAS_LOCATION.has(category)) {
    // 영업시간은 카페/식당/여행장소 셋 다 자유 텍스트 — 위치만 여행장소에서 지도
    // 매칭을 위해 17개 시/도로 고정된다.
    hours = String(req.body?.hours ?? '').trim().slice(0, 40) || null;
    if (category === 'travel') {
      const raw = String(req.body?.location ?? '').trim();
      if (!SIDO_NAMES.has(raw)) return { error: 'INVALID_REGION' };
      location = raw;
    } else {
      location = String(req.body?.location ?? '').trim().slice(0, 60) || null;
    }
  }

  let visited = 0;
  let visitedColor = null;
  if (category === 'travel') {
    visited = req.body?.visited ? 1 : 0;
    if (visited) {
      const color = String(req.body?.visitedColor ?? '');
      if (color !== 'pink' && color !== 'blue') return { error: 'INVALID_VISITED_COLOR' };
      visitedColor = color;
    }
  }

  if (!name) return { error: 'NAME_REQUIRED' };
  return { value: { name, location, hours, rating, review, visited, visitedColor } };
}

hobbyRouter.get('/', (req, res) => {
  const category = String(req.query.category ?? '');
  if (!CATEGORIES.has(category)) return res.status(400).json({ ok: false, error: 'INVALID_CATEGORY' });

  const items = listHobbyItemsByCategory(req.operator.id, category);
  res.json({ ok: true, items: items.map(toPublicItem) });
});

hobbyRouter.post('/', (req, res) => {
  const category = String(req.body?.category ?? '');
  if (!CATEGORIES.has(category)) return res.status(400).json({ ok: false, error: 'INVALID_CATEGORY' });

  const parsed = parsePayload(req, category);
  if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error });

  const item = createHobbyItem({ operatorId: req.operator.id, category, ...parsed.value });
  res.json({ ok: true, item: toPublicItem(item) });
});

hobbyRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = getHobbyItem(id, req.operator.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

  const parsed = parsePayload(req, existing.category);
  if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error });

  const item = updateHobbyItem({ id, operatorId: req.operator.id, ...parsed.value });
  res.json({ ok: true, item: toPublicItem(item) });
});

hobbyRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const ok = deleteHobbyItem(id, req.operator.id);
  if (!ok) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
  res.json({ ok: true });
});
