const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(payload?.error || payload?.message || 'Request failed', res.status);
  }

  return payload;
}

export function wsUrl() {
  return (import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:3001') + '/ws/terminal';
}
