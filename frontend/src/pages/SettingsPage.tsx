import { useEffect, useState } from 'react';
import { api } from '../api/client';

export function SettingsPage() {
  const [label, setLabel] = useState('Main Repo');
  const [absolute_path, setPath] = useState('/workspace');
  const [repos, setRepos] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  async function load() {
    setRepos(await api('/api/v1/repos'));
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="card">
      <h2>Settings / Repo Roots</h2>
      <label>Label<input value={label} onChange={(e) => setLabel(e.target.value)} /></label>
      <label>Path<input value={absolute_path} onChange={(e) => setPath(e.target.value)} /></label>
      <button onClick={async () => {
        try {
          await api('/api/v1/repos', { method: 'POST', body: JSON.stringify({ label, absolute_path }) });
          setMessage('Saved');
          await load();
        } catch (e: any) {
          setMessage(e.message);
        }
      }}>Add Repo Root</button>
      <p>{message}</p>
      <h3>Configured roots</h3>
      {repos.map((repo) => <div className="snapshot" key={repo.id}><b>{repo.label}</b><div>{repo.absolute_path}</div></div>)}
    </div>
  );
}
