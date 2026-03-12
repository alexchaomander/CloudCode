import { useEffect, useState } from 'react';
import { api } from '../api/client';

type Profile = {
  id: number;
  name: string;
  slug: string;
  command: string;
};

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [message, setMessage] = useState('');
  const [newProfile, setNewProfile] = useState({ name: '', slug: '', command: '' });

  async function load() {
    setProfiles(await api('/api/v1/profiles'));
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="card">
        <h2>Agent Profiles</h2>
        <label>Name<input value={newProfile.name} onChange={(e) => setNewProfile((p) => ({ ...p, name: e.target.value }))} /></label>
        <label>Slug<input value={newProfile.slug} onChange={(e) => setNewProfile((p) => ({ ...p, slug: e.target.value }))} /></label>
        <label>Command<input value={newProfile.command} onChange={(e) => setNewProfile((p) => ({ ...p, command: e.target.value }))} /></label>
        <button onClick={async () => {
          try {
            await api('/api/v1/profiles', {
              method: 'POST',
              body: JSON.stringify({ ...newProfile, args_json: [], env_json: {} })
            });
            setNewProfile({ name: '', slug: '', command: '' });
            setMessage('Profile created');
            await load();
          } catch (e: any) {
            setMessage(e.message);
          }
        }}>Add Profile</button>
        <p>{message}</p>
      </div>

      {profiles.map((p) => (
        <div className="card" key={p.id}>
          <b>{p.name}</b>
          <div>{p.slug}</div>
          <div>{p.command}</div>
          <button className="danger" onClick={async () => {
            await api(`/api/v1/profiles/${p.id}`, { method: 'DELETE' });
            await load();
          }}>Delete</button>
        </div>
      ))}
    </div>
  );
}
