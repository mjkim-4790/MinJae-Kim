import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router-dom';

import { springTap } from '../lib/motionPresets.js';

// Apple 이 "Drawer / sheet" 에 쓰는 값(damping 0.8, response 0.3). 서랍은 손으로 민 것처럼
// 살짝의 바운스를 남긴다. 스크림은 움직임이 아니라 밝기 변화라 스프링 대신 짧은 이징.
const drawerSpring = { type: 'spring', bounce: 0.2, duration: 0.3 };
const scrimFade = { duration: 0.2, ease: 'easeOut' };

/**
 * 오른쪽 상단 햄버거 버튼 + 오른쪽에서 밀려 나오는 메뉴 서랍.
 *
 * 오른쪽에서 나와 오른쪽으로 사라진다 (§7 공간 일관성 — 사라진 방향에서 다시 나온다).
 * 서랍이 열려 있는 동안은 뒤 배경을 딤 처리해 지금 할 일에 집중시키고 (§12),
 * Esc·스크림 탭·링크 이동 어느 쪽으로도 닫힌다.
 */
export default function AppMenu() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  // 열려 있는 동안: Esc 로 닫기, 뒤 배경 스크롤 잠금, 포커스를 서랍 안으로.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <motion.button
        ref={triggerRef}
        type="button"
        className="appmenu__trigger"
        aria-label="메뉴 열기"
        aria-expanded={open}
        aria-controls="app-menu-panel"
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.92 }}
        transition={springTap}
      >
        <span className="appmenu__bar" />
        <span className="appmenu__bar" />
        <span className="appmenu__bar" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="appmenu__scrim"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={scrimFade}
            />
            <motion.div
              id="app-menu-panel"
              ref={panelRef}
              className="appmenu__panel"
              role="dialog"
              aria-modal="true"
              aria-label="메뉴"
              tabIndex={-1}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={drawerSpring}
            >
              <div className="appmenu__head">
                <span className="appmenu__title">메뉴</span>
                <motion.button
                  type="button"
                  className="appmenu__close"
                  aria-label="메뉴 닫기"
                  onClick={() => setOpen(false)}
                  whileTap={{ scale: 0.9 }}
                  transition={springTap}
                >
                  ✕
                </motion.button>
              </div>

              <nav className="appmenu__nav">
                <Link className="appmenu__item" to="/operator" onClick={() => setOpen(false)}>
                  운영자 전용
                </Link>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
