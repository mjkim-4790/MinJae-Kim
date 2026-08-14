import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth.jsx';

export default function RequireOperator() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'checking') {
    return (
      <main className="page page--center">
        <p className="subtitle">확인 중…</p>
      </main>
    );
  }

  if (status === 'signedOut') {
    return <Navigate to="/operator/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
