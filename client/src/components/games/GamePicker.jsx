import { motion } from 'motion/react';

import { GameIcon, SELF_CONTAINED_ICON_IDS } from './GameIcons.jsx';
import { GAMES } from '../../lib/games.js';
import { springTap } from '../../lib/motionPresets.js';

/**
 * 운영자가 진행할 게임을 고르는 아이콘 그리드.
 * 아직 만들지 않은 게임(ready: false)은 회색 "준비중" 으로만 보이고 선택할 수 없다.
 *
 * @param {{ onSelect: (id: string) => void, runningGameId?: string|null }} props
 *   runningGameId — 지금 진행 중인 게임. 목록으로 나와 있어도 뭐가 돌아가는지 보이게 배지를 띄운다.
 */
export default function GamePicker({ onSelect, runningGameId = null }) {
  return (
    <ul className="game-grid">
      {GAMES.map((game) => {
        const running = runningGameId === game.id;
        return (
          <li key={game.id}>
            <motion.button
              type="button"
              className={`game-tile${game.ready ? '' : ' game-tile--soon'}`}
              disabled={!game.ready}
              onClick={() => game.ready && onSelect(game.id)}
              whileTap={game.ready ? { scale: 0.94 } : undefined}
              transition={springTap}
            >
              <span
                className={`game-tile__icon${
                  SELF_CONTAINED_ICON_IDS.has(game.id) ? ' game-tile__icon--bare' : ''
                }`}
              >
                <GameIcon id={game.id} muted={!game.ready} />
                {running && <span className="game-tile__badge">진행 중</span>}
              </span>
              <span className="game-tile__name">{game.name}</span>
              {!game.ready && <span className="game-tile__soon">준비중</span>}
            </motion.button>
          </li>
        );
      })}
    </ul>
  );
}
