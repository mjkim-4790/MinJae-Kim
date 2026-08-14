import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [operator, setOperator] = useState(null);
  const [status, setStatus] = useState('checking'); // checking | signedIn | signedOut

  useEffect(() => {
    api
      .me()
      .then((res) => {
        setOperator(res.operator);
        setStatus('signedIn');
      })
      .catch(() => setStatus('signedOut'));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.login(email, password);
    setOperator(res.operator);
    setStatus('signedIn');
    return res.operator;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
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
