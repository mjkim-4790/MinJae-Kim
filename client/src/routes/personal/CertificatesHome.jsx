import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router-dom';

import CertificatePanel from '../../components/education/CertificatePanel.jsx';
import PersonalLayout from '../../components/personal/PersonalLayout.jsx';
import { api } from '../../lib/api.js';
import { springSettle } from '../../lib/motionPresets.js';

const ERROR_MESSAGE = { NAME_REQUIRED: '자격증 이름을 입력하세요' };

export default function CertificatesHome() {
  const [items, setItems] = useState([]);
  const [panelItem, setPanelItem] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = () => {
    api
      .listCertificates()
      .then((res) => setItems(res.items))
      .catch(() => {});
  };

  useEffect(load, []);

  const closePanel = () => {
    setPanelItem(undefined);
    setError(null);
  };

  const save = async (payload) => {
    setBusy(true);
    setError(null);
    try {
      if (panelItem?.id) await api.updateCertificate(panelItem.id, payload);
      else await api.createCertificate(payload);
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
      await api.deleteCertificate(panelItem.id);
      closePanel();
      load();
    } catch {
      setError('삭제에 실패했습니다');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PersonalLayout>
      <main className="page hobby-category">
        <div className="screen-topbar">
          <div className="screen-topbar__left">
            <Link to="/home/education" className="back-chip" aria-label="교육 목록으로">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <span className="screen-title">자격증</span>
          </div>
          <button type="button" className="add-fab" onClick={() => setPanelItem(null)} aria-label="추가">
            +
          </button>
        </div>

        <ul className="cert-list">
          {items.length === 0 && <p className="subtitle">아직 등록한 자격증이 없어요. + 를 눌러 추가해보세요.</p>}
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`cert-card${item.achieved ? ' cert-card--done' : ''}`}
                onClick={() => setPanelItem(item)}
              >
                <span className="cert-card__name">{item.name}</span>
                {item.detail && <span className="cert-card__detail">{item.detail}</span>}
                <span className={`cert-card__status${item.achieved ? ' cert-card__status--done' : ' cert-card__status--pending'}`}>
                  {item.achieved ? '🎉 취득 완료' : '준비 중'}
                </span>
              </button>
            </li>
          ))}
        </ul>

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
            <CertificatePanel
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
