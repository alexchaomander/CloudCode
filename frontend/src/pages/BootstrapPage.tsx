import { useState } from 'react';
import { api } from '../api/client';

export function BootstrapPage({ onBootstrapped }: { onBootstrapped: () => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');

  return (
    <div className="container">
      <div className="card">
        <h2>Initialize CloudCode</h2>
        <p>Create your first admin account.</p>
        <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button onClick={async () => {
          try {
            await api('/api/v1/auth/bootstrap', { method: 'POST', body: JSON.stringify({ username, password }) });
            setStatus('Bootstrap successful. Please login.');
            onBootstrapped();
          } catch (e: any) {
            setStatus(e.message);
          }
        }}>Create Admin</button>
        <p>{status}</p>
      </div>
    </div>
  );
}
