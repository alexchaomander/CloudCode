import { useState } from 'react';
import { api } from '../api/client';

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  return (
    <div className="container">
      <div className="card">
        <h2>Login</h2>
        <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button onClick={async () => {
          try {
            await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
            onLogin();
          } catch (e: any) {
            setMessage(e.message);
          }
        }}>Login</button>
        <p>{message}</p>
      </div>
    </div>
  );
}
