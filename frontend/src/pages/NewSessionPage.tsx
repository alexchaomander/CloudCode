import { useEffect, useState } from 'react';
import { api } from '../api/client';

export function NewSessionPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [repos, setRepos] = useState<any[]>([]);
  const [title, setTitle] = useState('New Session');
  const [agent_profile_id, setProfile] = useState<number>();
  const [repo_root_id, setRepo] = useState<number>();
  const [workdir, setWorkdir] = useState('.');
  const [startup_prompt, setPrompt] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api('/api/v1/profiles').then((p) => {
      setProfiles(p);
      setProfile(p[0]?.id);
    });
    api('/api/v1/repos').then((r) => {
      setRepos(r);
      setRepo(r[0]?.id);
    });
  }, []);

  return (
    <div className="card">
      <h2>New Session</h2>
      {!repos.length ? <p>Add a repo root in Settings before creating a session.</p> : null}
      <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Profile
        <select value={agent_profile_id} onChange={(e) => setProfile(Number(e.target.value))}>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label>Repo
        <select value={repo_root_id} onChange={(e) => setRepo(Number(e.target.value))}>
          {repos.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </label>
      <label>Workdir<input value={workdir} onChange={(e) => setWorkdir(e.target.value)} /></label>
      <label>Startup Prompt<textarea value={startup_prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
      <button disabled={!repo_root_id || !agent_profile_id} onClick={async () => {
        try {
          const created = await api<{ public_id: string }>('/api/v1/sessions', {
            method: 'POST',
            body: JSON.stringify({ title, agent_profile_id, repo_root_id, workdir, startup_prompt })
          });
          setMessage(`Session created: ${created.public_id}`);
        } catch (e: any) {
          setMessage(e.message);
        }
      }}>Create</button>
      <p>{message}</p>
    </div>
  );
}
