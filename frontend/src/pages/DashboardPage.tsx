import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { Link } from 'react-router-dom';

type SessionRow = {
  public_id: string;
  title: string;
  profile_name: string;
  workdir: string;
  status: string;
  updated_at: string;
};

export function DashboardPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState('');

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await api('/api/v1/sessions'));
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    const timer = setInterval(loadSessions, 5000);
    return () => clearInterval(timer);
  }, [loadSessions]);

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Sessions</h2>
        <button onClick={loadSessions}>Refresh</button>
      </div>
      {error ? <div className="card">{error}</div> : null}
      {sessions.length === 0 ? <div className="card">No sessions yet. Create one from New Session.</div> : null}
      {sessions.map((s) => (
        <div className="card" key={s.public_id}>
          <b>{s.title}</b>
          <div>{s.profile_name} • {s.workdir}</div>
          <div>Status: <span className={`status-${s.status}`}>{s.status}</span></div>
          <small>Updated: {new Date(s.updated_at).toLocaleString()}</small>
          <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <Link to={`/sessions/${s.public_id}`}>Open</Link>
            <button onClick={async () => { await api(`/api/v1/sessions/${s.public_id}/stop`, { method: 'POST' }); await loadSessions(); }}>Interrupt</button>
            <button className="danger" onClick={async () => { await api(`/api/v1/sessions/${s.public_id}/kill`, { method: 'POST' }); await loadSessions(); }}>Kill</button>
            <button onClick={async () => { await api(`/api/v1/sessions/${s.public_id}/archive`, { method: 'POST' }); await loadSessions(); }}>Archive</button>
          </div>
        </div>
      ))}
    </div>
  );
}
