import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [operator, setOperator] = useState(null);
  const [status, setStatus] = useState('checking'); // checking | signedIn | signedOut

  // 로그인/로그아웃이 초기 /api/auth/me 확인보다 먼저 끝나면(사용자가 빠르게 로그인하거나
  // React StrictMode 가 effect 를 두 번 실행하는 개발 모드) 뒤늦게 도착하는 초기 확인
  // 결과가 방금 결정된 상태를 덮어쓰지 않도록 막는다.
  const settledRef = useRef(false);

  useEffect(() => {
    api
      .me()
      .then((res) => {
        if (settledRef.current) return;
        settledRef.current = true;
        setOperator(res.operator);
        setStatus('signedIn');
      })
      .catch(() => {
        if (settledRef.current) return;
        settledRef.current = true;
        setStatus('signedOut');
      });
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.login(email, password);
    settledRef.current = true;
    setOperator(res.operator);
    setStatus('signedIn');
    return res.operator;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    settledRef.current = true;
    setOperator(null);
    setStatus('signedOut');
  }, []);

  return (
    <AuthContext.Provider value={{ operator, status, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
