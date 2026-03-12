import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { NewSessionPage } from '../pages/NewSessionPage';
import { SessionPage } from '../pages/SessionPage';
import { ProfilesPage } from '../pages/ProfilesPage';
import { SettingsPage } from '../pages/SettingsPage';
import { AuditPage } from '../pages/AuditPage';
import { api } from '../api/client';
import { BootstrapPage } from '../pages/BootstrapPage';

type AuthState = 'checking' | 'authed' | 'unauthed' | 'bootstrap';

function Shell({ onLogout }: { onLogout: () => Promise<void> }) {
  const navigate = useNavigate();
  return (
    <div className="container">
      <header className="topbar">
        <div>
          <div style={{ fontWeight: 700 }}>CloudCode</div>
          <small style={{ color: '#6b7280' }}>Mobile-first remote CLI control</small>
        </div>
        <button onClick={async () => { await onLogout(); navigate('/login'); }}>Logout</button>
      </header>
      <nav className="row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <Link to="/">Dashboard</Link>
        <Link to="/sessions/new">New Session</Link>
        <Link to="/profiles">Profiles</Link>
        <Link to="/settings">Settings</Link>
        <Link to="/audit">Audit</Link>
      </nav>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/sessions/new" element={<NewSessionPage />} />
        <Route path="/sessions/:id" element={<SessionPage />} />
        <Route path="/profiles" element={<ProfilesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}

export function App() {
  const [state, setState] = useState<AuthState>('checking');

  useEffect(() => {
    (async () => {
      try {
        const bootstrap = await api<{ needsBootstrap: boolean }>('/api/v1/auth/bootstrap/status');
        if (bootstrap.needsBootstrap) {
          setState('bootstrap');
          return;
        }
        await api('/api/v1/auth/me');
        setState('authed');
      } catch {
        setState('unauthed');
      }
    })();
  }, []);

  if (state === 'checking') return <div className="container"><div className="card">Loading…</div></div>;
  if (state === 'bootstrap') return <BootstrapPage onBootstrapped={() => setState('unauthed')} />;

  return (
    <Routes>
      <Route path="/login" element={state === 'authed' ? <Navigate to="/" /> : <LoginPage onLogin={() => setState('authed')} />} />
      <Route path="/*" element={state === 'authed' ? <Shell onLogout={async () => { await api('/api/v1/auth/logout', { method: 'POST' }); setState('unauthed'); }} /> : <Navigate to="/login" />} />
    </Routes>
  );
}
