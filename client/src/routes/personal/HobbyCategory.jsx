import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, Navigate, useParams } from 'react-router-dom';

import HobbyItemPanel from '../../components/hobby/HobbyItemPanel.jsx';
import KoreaMapView from '../../components/hobby/KoreaMapView.jsx';
import PersonalLayout from '../../components/personal/PersonalLayout.jsx';
import { api } from '../../lib/api.js';
import { hobbyCategoryById } from '../../lib/hobby.js';
import { springSettle } from '../../lib/motionPresets.js';

const ERROR_MESSAGE = {
  NAME_REQUIRED: '이름을 입력하세요',
  INVALID_REGION: '지역을 선택하세요',
  INVALID_VISITED_COLOR: '색을 선택하세요',
};

function ItemCard({ item, onClick }) {
  return (
    <button type="button" className="wish-card" onClick={onClick}>
      <span className="wish-card__name">{item.name}</span>
      {(item.location || item.hours) && (
        <span className="wish-card__meta">
          {[item.location, item.hours].filter(Boolean).join(' · ')}
        </span>
      )}
      {item.visited !== undefined && (
        <span
          className="wish-card__meta"
          style={{ color: item.visited ? 'var(--visit-pink)' : 'var(--wish-yellow)', fontWeight: 700 }}
        >
          {item.visited ? '다녀왔어요' : '가보고 싶어요'}
        </span>
      )}
      {item.rating > 0 && (
        <span className="wish-card__stars">{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</span>
      )}
    </button>
  );
}

export default function HobbyCategory() {
  const { category: categoryId } = useParams();
  const category = hobbyCategoryById(categoryId);

  const [items, setItems] = useState([]);
  const [panelItem, setPanelItem] = useState(undefined); // undefined=닫힘, null=새로 추가, {..}=수정
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = () => {
    if (!category) return;
    api
      .listHobbyItems(category.id)
      .then((res) => setItems(res.items))
      .catch(() => {});
  };

  useEffect(load, [categoryId]);

  if (!category) return <Navigate to="/home/hobby" replace />;

  const closePanel = () => {
    setPanelItem(undefined);
    setError(null);
  };

  const save = async (payload) => {
    setBusy(true);
    setError(null);
    try {
      if (panelItem?.id) {
        await api.updateHobbyItem(panelItem.id, payload);
      } else {
        await api.createHobbyItem(category.id, payload);
      }
      closePanel();
      load();
    } catch (err) {
      setError(ERROR_MESSAGE[err.code] ?? '저장에 실패했습니다');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!panelItem?.id) return;
    setBusy(true);
    try {
      await api.deleteHobbyItem(panelItem.id);
      closePanel();
      load();
    } catch {
      setError('삭제에 실패했습니다');
    } finally {
      setBusy(false);
    }
  };

  const list = (
    <ul className="wish-list">
      {items.length === 0 && <p className="subtitle">아직 리스트업한 게 없어요. + 를 눌러 추가해보세요.</p>}
      {items.map((item) => (
        <li key={item.id}>
          <ItemCard item={item} onClick={() => setPanelItem(item)} />
        </li>
      ))}
    </ul>
  );

  return (
    <PersonalLayout>
      <main className="page hobby-category">
        <div className="screen-topbar">
          <div className="screen-topbar__left">
            <Link to="/home/hobby" className="back-chip" aria-label="취미 목록으로">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <span className="screen-title">{category.label}</span>
          </div>
          <button type="button" className="add-fab" onClick={() => setPanelItem(null)} aria-label="추가">
            +
          </button>
        </div>

        {category.isTravel ? (
          <div className="travel-split">
            <div className="travel-split__list">{list}</div>
            <div className="travel-split__map-wrap">
              <div className="map-legend">
                <span>
                  <span className="map-legend__dot" style={{ background: 'var(--wish-yellow)' }} />
                  가보고 싶어요
                </span>
                <span>
                  <span className="map-legend__dot" style={{ background: 'var(--visit-pink)' }} />
                  다녀왔어요
                </span>
              </div>
              <KoreaMapView items={items} />
            </div>
          </div>
        ) : (
          list
        )}

        <AnimatePresence>
          {panelItem !== undefined && (
            <motion.div
              className="hobby-panel-scrim"
              onClick={closePanel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springSettle}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {panelItem !== undefined && (
            <HobbyItemPanel
              category={category}
              initial={panelItem}
              onSave={save}
              onClose={closePanel}
              onDelete={panelItem?.id ? remove : undefined}
              busy={busy}
              error={error}
            />
          )}
        </AnimatePresence>
      </main>
    </PersonalLayout>
  );
}
