import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';

export interface TunnelInfo {
  url: string;
  process: ChildProcess;
}

let activeTunnel: ChildProcess | null = null;

export async function startTunnel(port: number): Promise<TunnelInfo> {
  return new Promise((resolve, reject) => {
    // Stop any existing tunnel first
    if (activeTunnel) {
      activeTunnel.kill();
    }

    const child = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`]);
    activeTunnel = child;
    
    const rl = createInterface({ input: child.stderr });
    let urlFound = false;

    rl.on('line', (line) => {
      const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !urlFound) {
        urlFound = true;
        resolve({
          url: match[0],
          process: child
        });
      }
    });

    child.on('error', (err: any) => {
      if (!urlFound) {
        if (err.code === 'ENOENT') {
          reject(new Error('cloudflared not found. Please install it first: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-cloudflare-tunnel/'));
        } else {
          reject(new Error(`Failed to start cloudflared: ${err.message}`));
        }
      }
    });

    child.on('exit', (code) => {
      activeTunnel = null;
      if (!urlFound) {
        reject(new Error(`cloudflared exited with code ${code} before providing a URL.`));
      }
    });

    setTimeout(() => {
      if (!urlFound) {
        child.kill();
        reject(new Error('Timed out waiting for cloudflared tunnel URL.'));
      }
    }, 15000);
  });
}

export function stopTunnel() {
  if (activeTunnel) {
    activeTunnel.kill();
    activeTunnel = null;
  }
}
