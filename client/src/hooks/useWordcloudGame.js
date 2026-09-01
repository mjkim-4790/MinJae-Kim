import { useCallback, useEffect, useRef, useState } from 'react';

import { socket } from '../lib/socket.js';
import { normalizeWord } from '../lib/wordcloud.js';

const IDLE_STATE = {
  status: 'idle',
  mode: null,
  prompt: '',
  presetWords: [],
  words: [],
  contributorCount: 0,
  totalCount: 0,
  top: [],
};

const FLUSH_MS = 180; // 연타를 모아 보내는 간격
const MAX_BURST = 20; // 서버(wordcloudEngine.MAX_BURST)와 맞춘 값

/**
 * '단어 구름' 실시간 상태.
 *
 * 버튼 모드는 무제한 연타라서, 누를 때마다 소켓을 쏘면 50명 기준 초당 수백 건이 된다.
 * 그래서 여기서 FLUSH_MS 동안 모았다가 한 번에 보낸다. 화면 숫자는 기다리지 않고
 * 곧바로 올려서(낙관적 반영) 누르는 손맛은 그대로 남긴다.
 */
export function useWordcloudGame({ eventCode, initialState, initialYourWords }) {
  const [state, setState] = useState(initialState ?? IDLE_STATE);
  const [myWords, setMyWords] = useState(() => new Map((initialYourWords ?? []).map((w) => [w.word, w.count])));
  const [dismissed, setDismissed] = useState(false);

  const pendingRef = useRef(new Map()); // word -> 아직 못 보낸 횟수
  const flushTimerRef = useRef(null);

  useEffect(() => {
    if (initialState) setState(initialState);
  }, [initialState]);

  useEffect(() => {
    if (initialYourWords) setMyWords(new Map(initialYourWords.map((w) => [w.word, w.count])));
  }, [initialYourWords]);

  useEffect(() => {
    const onState = (next) => setState(next);
    socket.on('wordcloud:state', onState);
    return () => socket.off('wordcloud:state', onState);
  }, []);

  // 새 판이 시작되면 내가 낸 단어도 비운다
  useEffect(() => {
    if (state.status === 'collecting' && state.totalCount === 0) {
      setMyWords(new Map());
      pendingRef.current = new Map();
    }
    if (state.status !== 'ended') setDismissed(false);
  }, [state.status, state.totalCount]);

  const flush = useCallback(() => {
    flushTimerRef.current = null;
    const pending = pendingRef.current;
    if (pending.size === 0) return;
    pendingRef.current = new Map();

    pending.forEach((count, word) => {
      // 서버 상한을 넘길 만큼 쌓였다면 나눠 보낸다 (사람 손으로는 거의 안 생긴다)
      let left = count;
      while (left > 0) {
        const chunk = Math.min(left, MAX_BURST);
        socket.emit('wordcloud:submit', { eventCode, word, count: chunk });
        left -= chunk;
      }
    });
  }, [eventCode]);

  // 언마운트되거나 판이 끝날 때 남은 연타를 흘려보내지 않는다
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flush();
    };
  }, [flush]);

  const submit = useCallback(
    (rawWord) => {
      // 서버와 같은 규칙으로 다듬어야 "내가 낸 단어"와 구름의 표기가 어긋나지 않는다
      const word = normalizeWord(rawWord);
      if (!word) return;

      setMyWords((prev) => {
        const next = new Map(prev);
        next.set(word, (next.get(word) ?? 0) + 1);
        return next;
      });

      pendingRef.current.set(word, (pendingRef.current.get(word) ?? 0) + 1);
      if (!flushTimerRef.current) flushTimerRef.current = setTimeout(flush, FLUSH_MS);
    },
    [flush],
  );

  const start = useCallback(
    ({ mode, words, prompt }) =>
      new Promise((resolve) =>
        socket.emit('wordcloud:start', { eventCode, mode, words, prompt }, resolve),
      ),
    [eventCode],
  );
  const close = useCallback(
    () => new Promise((resolve) => socket.emit('wordcloud:close', { eventCode }, resolve)),
    [eventCode],
  );
  const reopen = useCallback(
    () => new Promise((resolve) => socket.emit('wordcloud:reopen', { eventCode }, resolve)),
    [eventCode],
  );
  const end = useCallback(
    () => new Promise((resolve) => socket.emit('wordcloud:end', { eventCode }, resolve)),
    [eventCode],
  );
  const reset = useCallback(
    () => new Promise((resolve) => socket.emit('wordcloud:reset', { eventCode }, resolve)),
    [eventCode],
  );
  const dismiss = useCallback(() => setDismissed(true), []);

  return { state, myWords, dismissed, submit, start, close, reopen, end, reset, dismiss };
}
