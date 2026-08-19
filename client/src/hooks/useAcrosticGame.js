import { useCallback, useEffect, useState } from 'react';

import { socket } from '../lib/socket.js';

const IDLE_STATE = {
  status: 'idle',
  prompt: null,
  syllables: [],
  activeParticipantIds: [],
  submittedParticipantIds: [],
  votedParticipantIds: [],
  entries: null,
  ranking: null,
};

/**
 * 삼행시 실시간 상태 (useLiarGame.js 와 같은 구조). session:hello/player:join 응답의 초기
 * 스냅샷으로 시작하고, 이후 acrostic:state 브로드캐스트로 계속 동기화한다.
 *
 * yourEntryId 는 "투표 화면에서 몇 번이 내 작품인지"다. 익명 투표라 전체 브로드캐스트에는
 * 작성자가 없고(§ acrostic.js 주석), 마감 시점에 서버가 각 참여자 소켓에만 개별로 쏴준다 —
 * 자기 작품에 투표하지 못하게 막기 위한 값이다 (서버도 한 번 더 막는다).
 *
 * @param {{ eventCode: string, initialState?: object, initialYourEntry?: object }} args
 */
export function useAcrosticGame({ eventCode, initialState, initialYourEntry }) {
  const [state, setState] = useState(initialState ?? IDLE_STATE);
  const [yourEntryId, setYourEntryId] = useState(initialYourEntry?.entryId ?? null);
  // 참여자가 스스로 "확인"을 눌러 종료 화면을 닫고 원래 화면으로 돌아가기 위한 로컬 상태
  // (useTypingGame.js 와 동일한 이유).
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (initialState) setState(initialState);
  }, [initialState]);

  useEffect(() => {
    if (initialYourEntry) setYourEntryId(initialYourEntry.entryId);
  }, [initialYourEntry]);

  useEffect(() => {
    const onState = (next) => setState(next);
    const onYourEntry = ({ entryId }) => setYourEntryId(entryId);
    socket.on('acrostic:state', onState);
    socket.on('acrostic:yourEntry', onYourEntry);
    return () => {
      socket.off('acrostic:state', onState);
      socket.off('acrostic:yourEntry', onYourEntry);
    };
  }, []);

  useEffect(() => {
    if (state.status !== 'ended') setDismissed(false);
    // 새 라운드가 시작되면 지난 라운드의 내 작품 번호는 의미가 없다
    if (state.status === 'idle' || state.status === 'writing') setYourEntryId(null);
  }, [state.status]);

  const start = useCallback(
    (prompt) => new Promise((resolve) => socket.emit('acrostic:start', { eventCode, prompt }, resolve)),
    [eventCode],
  );
  const submit = useCallback(
    (lines) => new Promise((resolve) => socket.emit('acrostic:submit', { eventCode, lines }, resolve)),
    [eventCode],
  );
  const lock = useCallback(
    () => new Promise((resolve) => socket.emit('acrostic:lock', { eventCode }, resolve)),
    [eventCode],
  );
  const vote = useCallback(
    (entryId) => new Promise((resolve) => socket.emit('acrostic:vote', { eventCode, entryId }, resolve)),
    [eventCode],
  );
  const reveal = useCallback(
    () => new Promise((resolve) => socket.emit('acrostic:reveal', { eventCode }, resolve)),
    [eventCode],
  );
  const advance = useCallback(
    () => new Promise((resolve) => socket.emit('acrostic:advance', { eventCode }, resolve)),
    [eventCode],
  );
  const reset = useCallback(
    () => new Promise((resolve) => socket.emit('acrostic:reset', { eventCode }, resolve)),
    [eventCode],
  );
  const dismiss = useCallback(() => setDismissed(true), []);

  return { state, yourEntryId, dismissed, start, submit, lock, vote, reveal, advance, reset, dismiss };
}
