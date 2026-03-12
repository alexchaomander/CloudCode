import { useEffect, useState } from 'react';
import { api } from '../api/client';

export function AuditPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [eventType, setEventType] = useState('');

  async function load() {
    const query = eventType ? `?event_type=${encodeURIComponent(eventType)}` : '';
    setRows(await api(`/api/v1/audit${query}`));
  }

  useEffect(() => { load(); }, [eventType]);

  return (
    <div>
      <div className="card">
        <h2>Audit Log</h2>
        <label>Filter by event type<input value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="session.created" /></label>
      </div>
      {rows.map((r) => (
        <div className="card" key={r.id}>
          <div><b>{r.event_type}</b></div>
          <div>{r.created_at}</div>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{r.metadata_json}</pre>
        </div>
      ))}
    </div>
  );
}
