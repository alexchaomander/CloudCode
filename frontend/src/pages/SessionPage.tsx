import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { api, wsUrl } from '../api/client';

type Snapshot = { id: number; content_text: string; snapshot_type: string; created_at: string };

export function SessionPage() {
  const { id } = useParams();
  const ref = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState('connecting');
  const [note, setNote] = useState('');
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  const actions = useMemo(() => [
    { label: 'Ctrl+C', run: () => sendSpecial('C-c') },
    { label: 'Esc', run: () => sendInput('\u001b') },
    { label: 'Tab', run: () => sendInput('\t') },
    { label: 'Enter', run: () => sendSpecial('Enter') },
    { label: '↑', run: () => sendInput('\u001b[A') },
    { label: '↓', run: () => sendInput('\u001b[B') },
    { label: '←', run: () => sendInput('\u001b[D') },
    { label: '→', run: () => sendInput('\u001b[C') }
  ], []);

  function sendInput(payload: string) {
    wsRef.current?.send(JSON.stringify({ type: 'terminal.input', payload }));
  }

  function sendSpecial(key: string) {
    wsRef.current?.send(JSON.stringify({ type: 'terminal.special', key }));
  }

  async function loadSnapshots() {
    if (!id) return;
    setSnapshots(await api(`/api/v1/sessions/${id}/snapshots`));
  }

  useEffect(() => {
    if (!id) return;

    const term = new Terminal({ fontSize: 14, rows: 30, convertEol: true, cursorBlink: true });
    const fit = new FitAddon();
    fitRef.current = fit;
    term.loadAddon(fit);
    term.open(ref.current!);
    fit.fit();

    let shouldReconnect = true;
    let reconnectTimer: number | undefined;

    const connect = () => {
      setStatus('connecting');
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        ws.send(JSON.stringify({ type: 'subscribe', sessionId: id }));
        ws.send(JSON.stringify({ type: 'request_refresh' }));
        ws.send(JSON.stringify({ type: 'terminal.resize', cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'terminal.output') term.write(msg.payload);
        if (msg.type === 'session.error') term.writeln(`\r\n[cloudcode error] ${msg.payload}`);
      };

      ws.onclose = () => {
        setStatus('disconnected');
        if (shouldReconnect) reconnectTimer = window.setTimeout(connect, 1000);
      };
    };

    connect();
    const disposeOnData = term.onData((data) => sendInput(data));

    const onResize = () => {
      fit.fit();
      wsRef.current?.send(JSON.stringify({ type: 'terminal.resize', cols: term.cols, rows: term.rows }));
    };
    window.addEventListener('resize', onResize);

    return () => {
      shouldReconnect = false;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.removeEventListener('resize', onResize);
      disposeOnData.dispose();
      wsRef.current?.close();
      term.dispose();
    };
  }, [id]);

  useEffect(() => {
    loadSnapshots();
  }, [id]);

  return (
    <div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Session {id}</h2>
          <span className={`status-${status}`}>{status}</span>
        </div>
        <div ref={ref} style={{ height: '60vh', background: '#000', borderRadius: 8 }} />
        <div className="row keyboard-row">
          {actions.map((a) => <button key={a.label} onClick={a.run}>{a.label}</button>)}
          <button onClick={async () => {
            const text = window.prompt('Paste text into terminal');
            if (text) sendInput(text);
          }}>Paste</button>
          <button onClick={() => {
            fitRef.current?.fit();
            wsRef.current?.send(JSON.stringify({ type: 'request_refresh' }));
          }}>Refresh</button>
        </div>
      </div>

      <div className="card">
        <h3>Snapshots</h3>
        <div className="row">
          <input value={note} placeholder="Add manual note" onChange={(e) => setNote(e.target.value)} />
          <button onClick={async () => {
            if (!note.trim() || !id) return;
            await api(`/api/v1/sessions/${id}/snapshots`, { method: 'POST', body: JSON.stringify({ content_text: note }) });
            setNote('');
            await loadSnapshots();
          }}>Add</button>
        </div>
        {snapshots.map((s) => (
          <div key={s.id} className="snapshot">
            <small>{s.snapshot_type} • {new Date(s.created_at).toLocaleString()}</small>
            <div>{s.content_text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
