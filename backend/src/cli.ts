#!/usr/bin/env node
import { createRequire } from 'module';
const { version } = createRequire(import.meta.url)('../package.json');
import { Command } from 'commander';
import chalk from 'chalk';
import qrcode from 'qrcode-terminal';
import { execSync, spawn } from 'child_process';
import { join } from 'path';
import { tmpdir, networkInterfaces } from 'os';
import { randomBytes } from 'crypto';
import { nanoid } from 'nanoid';
import { buildApp } from './index.js';
import { runMigrations } from './db/migrations.js';
import { getFirstAdminUser, createPairingToken, hashPassword, createUser } from './auth/service.js';
import { syncSessionStatus, createSession } from './sessions/service.js';
import { sidecarManager } from './terminal/sidecar-manager.js';
import { db } from './db/index.js';
import { startTunnel, stopTunnel } from './utils/tunnel.js';
import { readTranscript } from './terminal/transcript-store.js';

const program = new Command();

program
  .name('cloudcode')
  .description('CloudCode CLI — Secure remote control for your local coding environment')
  .version(version);

// Helper to start the server in-process
async function startServer(options: { port: number; host: string; sidecarSocketPath?: string }) {
  runMigrations();
  const app = await buildApp({ sidecarSocketPath: options.sidecarSocketPath });

  const syncInterval = setInterval(async () => {
    try {
      await syncSessionStatus();
    } catch (err) {
      app.log.error({ err }, 'Failed to sync session status');
    }
  }, 30_000);

  const shutdown = async (signal: string): Promise<void> => {
    clearInterval(syncInterval);
    try {
      stopTunnel();
      await sidecarManager.stop();
      await app.close();
      process.exit(0);
    } catch (err) {
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await app.listen({ port: options.port, host: options.host });
  return app;
}

program
  .command('init')
  .description('Check dependencies and initialize CloudCode environment')
  .action(async () => {
    console.log(chalk.blue.bold('\n🔍 CloudCode System Check\n'));

    const checkDep = (name: string, cmd: string) => {
      try {
        const version = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        console.log(`${chalk.green('✅')} ${chalk.bold(name.padEnd(10))} Found (${chalk.dim(version.split('\n')[0])})`);
        return true;
      } catch {
        console.log(`${chalk.red('❌')} ${chalk.bold(name.padEnd(10))} Not found`);
        return false;
      }
    };

    const deps = [
      { name: 'Node.js', cmd: 'node --version' },
      { name: 'Go', cmd: 'go version' },
      { name: 'tmux', cmd: 'tmux -V' },
      { name: 'git', cmd: 'git --version' },
    ];

    let allDepsFound = true;
    for (const dep of deps) {
      if (!checkDep(dep.name, dep.cmd)) allDepsFound = false;
    }

    if (!allDepsFound) {
      console.log(chalk.yellow('\n⚠️  Some dependencies are missing. Please install them to ensure CloudCode works correctly.'));
    }

    console.log(chalk.blue.bold('\n🤖 Agent Detection\n'));
    const agents = [
      { name: 'Claude Code', cmd: 'claude --version', slug: 'claude-code' },
      { name: 'Gemini CLI', cmd: 'gemini --version', slug: 'gemini-cli' },
      { name: 'Copilot', cmd: 'copilot version', slug: 'github-copilot' },
    ];

    for (const agent of agents) {
      try {
        // Try running the version command
        execSync(agent.cmd, { stdio: 'ignore' });
        console.log(`${chalk.green('✅')} ${chalk.bold(agent.name.padEnd(12))} Detected`);
      } catch {
        // Fallback: check if the binary exists in PATH at all
        try {
          const binaryName = agent.cmd.split(' ')[0];
          execSync(`command -v ${binaryName}`, { stdio: 'ignore' });
          console.log(`${chalk.green('✅')} ${chalk.bold(agent.name.padEnd(12))} Detected (Binary found)`);
        } catch {
          console.log(`${chalk.gray('➖')} ${chalk.dim(agent.name.padEnd(12))} Not detected`);
        }
      }
    }

    runMigrations();
    const admin = getFirstAdminUser();
    if (!admin) {
      console.log(chalk.yellow('\n👤 No admin user found.'));
      console.log(chalk.dim('   Run "cloudcode run <agent>" or "cloudcode start" to create your first user.'));
    } else {
      console.log(chalk.green(`\n✅ Admin user "${admin.username}" is ready.`));
    }

    console.log(chalk.blue.bold('\n🌐 Networking Check\n'));
    try {
      execSync('tailscale version', { stdio: 'ignore' });
      console.log(`${chalk.green('✅')} ${chalk.bold('Tailscale')}   Detected (Recommended for secure remote access)`);
    } catch {
      console.log(`${chalk.yellow('ℹ️')} ${chalk.bold('Tailscale')}   Not detected (Optional)`);
    }

    console.log(chalk.cyan('\n✨ Initialization complete!'));
    console.log(chalk.gray('Use ') + chalk.white('cloudcode run claude-code --rc') + chalk.gray(' to start your first session.\n'));
  });

program
  .command('status')
  .description('Show status of active CloudCode sessions')
  .action(async () => {
    runMigrations();
    await syncSessionStatus();
    
    const sessions = db.prepare(`
      SELECT s.*, p.name as profile_name 
      FROM sessions s 
      JOIN agent_profiles p ON p.id = s.agent_profile_id 
      WHERE s.status = 'running'
      ORDER BY s.created_at DESC
    `).all() as any[];

    if (sessions.length === 0) {
      console.log(chalk.gray('\nNo active sessions.'));
      return;
    }

    console.log(chalk.blue.bold(`\n🚀 Active CloudCode Sessions (${sessions.length}):\n`));
    sessions.forEach(s => {
      const uptime = Math.floor((Date.now() - new Date(s.started_at).getTime()) / 60000);
      console.log(`${chalk.green('●')} ${chalk.bold(s.title)} [${chalk.cyan(s.public_id)}]`);
      console.log(`  ${chalk.dim('Agent:')} ${s.profile_name}`);
      console.log(`  ${chalk.dim('Path :')} ${s.workdir}`);
      console.log(`  ${chalk.dim('Uptime:')} ${uptime}m\n`);
    });
  });

program
  .command('attach')
  .description('Attach to a session via tmux')
  .argument('<id>', 'Public ID of the session (e.g. 5x7h2k9)')
  .action(async (id: string) => {
    runMigrations();
    const session = db.prepare('SELECT tmux_session_name FROM sessions WHERE public_id = ?').get(id) as { tmux_session_name: string } | undefined;
    
    if (!session) {
      console.error(chalk.red(`Error: Session "${id}" not found.`));
      process.exit(1);
    }

    console.log(chalk.yellow(`Attaching to session ${id}... (Ctrl-b d to detach)`));
    try {
      spawn('tmux', ['attach-session', '-t', session.tmux_session_name], {
        stdio: 'inherit'
      }).on('exit', () => {
        process.exit(0);
      });
    } catch (err) {
      console.error(chalk.red('Failed to attach:'), err);
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop an active session')
  .argument('<id>', 'Public ID of the session')
  .action(async (id: string) => {
    runMigrations();
    const session = db.prepare('SELECT id, public_id, title FROM sessions WHERE public_id = ?').get(id) as { id: string; public_id: string; title: string } | undefined;
    
    if (!session) {
      console.error(chalk.red(`Error: Session "${id}" not found.`));
      process.exit(1);
    }

    const admin = getFirstAdminUser();
    if (!admin) {
      console.error(chalk.red('Error: Admin user not found.'));
      process.exit(1);
    }

    console.log(chalk.yellow(`Stopping session "${session.title}" [${session.public_id}]...`));
    try {
      const { stopSession } = await import('./sessions/service.js');
      await stopSession(session.id, admin.id);
      console.log(chalk.green('✅ Session stopped.'));
    } catch (err) {
      console.error(chalk.red('Failed to stop session:'), err);
      process.exit(1);
    }
  });

program
  .command('logs')
  .description('Show clean semantic logs for a session')
  .argument('<id>', 'Public ID of the session')
  .option('-f, --follow', 'Follow log output', false)
  .action(async (id: string, options: { follow: boolean }) => {
    runMigrations();
    const session = db.prepare('SELECT id, title FROM sessions WHERE public_id = ?').get(id) as { id: string; title: string } | undefined;
    
    if (!session) {
      console.error(chalk.red(`Error: Session "${id}" not found.`));
      process.exit(1);
    }

    const printLogs = async () => {
      try {
        const logs = await readTranscript(session.id, { asMarkdown: true });
        process.stdout.write('\x1b[H\x1b[2J'); // Clear screen
        console.log(chalk.blue.bold(`📝 Transcript for: ${session.title} [${id}]\n`));
        console.log(logs || chalk.dim('(Empty)'));
        if (options.follow) {
          console.log(chalk.yellow('\nWatching for changes... (Ctrl+C to stop)'));
        }
      } catch (err) {
        console.error(chalk.red('\nFailed to read transcript:'), err);
        if (!options.follow) process.exit(1);
      }
    };

    await printLogs();

    if (options.follow) {
      const interval = setInterval(printLogs, 2000);
      process.on('SIGINT', () => {
        clearInterval(interval);
        process.exit(0);
      });
    }
  });

program
  .command('start')
  .description('Start the CloudCode server')
  .option('-p, --port <number>', 'Port to listen on', '3000')
  .option('-h, --host <string>', 'Host to listen on', '0.0.0.0')
  .option('--rc', 'Enable Remote Control mode (Tailscale + Pairing QR)')
  .option('--tunnel', 'Expose the server via a public Cloudflare tunnel', false)
  .action(async (options: { port: string; host: string; rc: boolean; tunnel: boolean }) => {
    console.log(chalk.blue.bold('\n🚀 Starting CloudCode...'));
    const port = parseInt(options.port, 10);
    const host = options.host;

    try {
      let tunnelUrl = '';
      if (options.tunnel) {
        console.log(chalk.magenta('☁️  Opening Cloudflare tunnel...'));
        const tunnel = await startTunnel(port);
        tunnelUrl = tunnel.url;
        console.log(chalk.green(`✅ Public Tunnel URL: ${chalk.underline(tunnelUrl)}`));
      }

      await startServer({ port, host });
      console.log(chalk.green(`\n✅ CloudCode is running locally at: ${chalk.underline(`http://localhost:${port}`)}`));

      if (options.rc) {
        await showPairingInfo(port, undefined, tunnelUrl);
      }
    } catch (err) {
      console.error(chalk.red('Failed to start server:'), err);
      process.exit(1);
    }
  });

program
  .command('run')
  .description('Launch an agent session and start the remote control server')
  .argument('<agent>', 'Agent slug (e.g., claude-code, gemini-cli) or "custom"')
  .option('-c, --command <cmd>', 'Override the command to run (required if agent is "custom")')
  .option('-p, --port <number>', 'Server port', '3000')
  .option('--rc', 'Show pairing QR code for this session', true)
  .option('--worktree', 'Run in a temporary git worktree', false)
  .option('--tunnel', 'Expose the server via a public Cloudflare tunnel', false)
  .action(async (agentSlug: string, options: { port: string; command?: string; rc: boolean; worktree: boolean; tunnel: boolean }) => {
    runMigrations();
    
    let profile: any;
    if (agentSlug === 'custom') {
      if (!options.command) {
        console.error(chalk.red('Error: --command is required when using "custom" agent.'));
        process.exit(1);
      }
      profile = {
        id: 'custom',
        name: 'Custom Agent',
        slug: 'custom',
        command: options.command.split(' ')[0],
        args_json: JSON.stringify(options.command.split(' ').slice(1)),
        env_json: '{}'
      };
    } else {
      profile = db.prepare('SELECT * FROM agent_profiles WHERE slug = ?').get(agentSlug) as any;
      if (!profile) {
        console.error(chalk.red(`Error: Agent profile "${agentSlug}" not found.`));
        console.log(chalk.gray('Use "cloudcode profiles" to see available agents.'));
        process.exit(1);
      }
    }

    let admin = getFirstAdminUser();
    if (!admin) {
      console.log(chalk.yellow('ℹ️ No admin user found. Auto-bootstrapping first-time user...'));
      const username = process.env.USER || 'admin';
      const password = randomBytes(12).toString('hex');
      const passwordHash = await hashPassword(password);
      admin = createUser(username, passwordHash, true);
      console.log(chalk.green(`✅ Created admin user: ${chalk.bold(username)}`));
      console.log(chalk.dim(`   (Password: ${password} - You can change this in Settings later)\n`));
    }

    const port = parseInt(options.port, 10);
    const workdir = process.cwd();

    // Auto-register repo root if it doesn't exist
    const roots = db.prepare('SELECT * FROM repo_roots').all() as unknown as { absolute_path: string }[];
    const hasRoot = roots.some(r => workdir.startsWith(r.absolute_path));
    if (!hasRoot) {
      const rootId = nanoid();
      const label = workdir.split('/').pop() || 'Project';
      db.prepare('INSERT INTO repo_roots (id, label, absolute_path) VALUES (?, ?, ?)').run(rootId, label, workdir);
      console.log(chalk.dim(`📡 Registered repo root: ${workdir}`));
    }
    // Use a unique socket for this run to avoid conflicts
    const sidecarSocketPath = join(tmpdir(), `cloudcode-pty-${Date.now()}.sock`);

    console.log(chalk.blue(`\n🚀 Launching ${profile.name} and starting server...`));
    
    try {
      let tunnelUrl = '';
      if (options.tunnel) {
        console.log(chalk.magenta('☁️  Opening Cloudflare tunnel...'));
        const tunnel = await startTunnel(port);
        tunnelUrl = tunnel.url;
        console.log(chalk.green(`✅ Public Tunnel URL: ${chalk.underline(tunnelUrl)}`));
      }

      await startServer({ port, host: '0.0.0.0', sidecarSocketPath });
      
      const session = await createSession({
        title: `CLI: ${profile.name}`,
        agentProfileId: profile.id,
        userId: admin.id,
        workdir: process.cwd(),
        isWorktree: options.worktree,
      });

      if (options.rc) {
        await showPairingInfo(port, session.tmuxSessionName, tunnelUrl);
      }

      console.log(chalk.yellow(`\nAttaching to ${profile.name} session... (Ctrl-b d to detach)`));
      
      // Attach to the newly created tmux session
      spawn('tmux', ['attach-session', '-t', session.tmuxSessionName], {
        stdio: 'inherit'
      }).on('exit', () => {
        console.log(chalk.gray('\nDetached from session. Server is still running.'));
        process.exit(0);
      });

    } catch (err) {
      console.error(chalk.red('Failed to run session:'), err);
      process.exit(1);
    }
  });

program
  .command('profiles')
  .description('List all available agent profiles')
  .action(() => {
    runMigrations();
    const profiles = db.prepare('SELECT name, slug, command FROM agent_profiles').all() as unknown as any[];
    
    console.log(chalk.blue.bold('\n🤖 Available CloudCode Agents:'));
    profiles.forEach(p => {
      console.log(`${chalk.green('•')} ${chalk.bold(p.name)} (${chalk.cyan(p.slug)}) — ${chalk.dim(p.command)}`);
    });
    console.log(chalk.gray('\nYou can run any of these with: ') + chalk.white(`cloudcode run <slug> --rc`));
  });

program
  .command('share')
  .description('Generate a pairing QR code for the current tmux session')
  .option('-p, --port <number>', 'Server port', '3000')
  .action(async (options: { port: string }) => {
    const tmuxSession = process.env.TMUX;
    if (!tmuxSession) {
      console.error(chalk.red('Error: You are not inside a tmux session.'));
      process.exit(1);
    }

    // Extract session name from TMUX env var (format: /tmp/tmux-1000/default,1234,0)
    // But better to just ask tmux for the current session name
    let sessionName = '';
    try {
      sessionName = execSync('tmux display-message -p "#S"', { encoding: 'utf8' }).trim();
    } catch (err) {
      console.error(chalk.red('Error: Could not determine current tmux session.'));
      process.exit(1);
    }

    console.log(chalk.blue(`\n📢 Sharing session: ${chalk.bold(sessionName)}`));
    await showPairingInfo(parseInt(options.port, 10), sessionName);
  });
async function showPairingInfo(port: number, sessionName?: string, tunnelUrl?: string) {
  let remoteUrl = '';

  if (tunnelUrl) {
    remoteUrl = tunnelUrl;
  } else {
    // Try to find the tailscale binary in common locations
    const tailscalePaths = ['tailscale', '/usr/local/bin/tailscale', '/Applications/Tailscale.app/Contents/Resources/bin/tailscale'];
    let tsBin = 'tailscale';

    for (const p of tailscalePaths) {
      try {
        execSync(`${p} version`, { stdio: 'ignore' });
        tsBin = p;
        break;
      } catch {}
    }

    try {
      // 1. Try to get the Tailscale IP directly first (fastest and most reliable)
      const ip = execSync(`${tsBin} ip -4`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (ip) {
        // 2. Try to get MagicDNS name if available
        const status = JSON.parse(execSync(`${tsBin} status --json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
        const self = status.Self;
        if (self && self.DNSName) {
          const dnsName = self.DNSName.endsWith('.') ? self.DNSName.slice(0, -1) : self.DNSName;
          remoteUrl = `http://${dnsName}:${port}`;
        } else {
          remoteUrl = `http://${ip}:${port}`;
        }
      }
    } catch (err) {
      // Tailscale CLI failed, scan network interfaces directly
      const nets = networkInterfaces();
      let fallbackIp = '';
      
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]!) {
          if (net.family === 'IPv4' && !net.internal) {
            // Prioritize Tailscale IP range (100.64.0.0/10)
            if (net.address.startsWith('100.')) {
              remoteUrl = `http://${net.address}:${port}`;
              break;
            }
            if (!fallbackIp) fallbackIp = net.address;
          }
        }
        if (remoteUrl) break;
      }
      
      if (!remoteUrl && fallbackIp) {
        remoteUrl = `http://${fallbackIp}:${port}`;
      }
    }
  }

  const admin = getFirstAdminUser();
  if (!admin) return;

  const token = createPairingToken(admin.id);
  const baseUrl = remoteUrl || `http://localhost:${port}`;
  let pairingUrl = `${baseUrl}/pair?token=${token}`;

  if (remoteUrl) {
    console.log(chalk.dim(`\n📡 Detected network address: ${remoteUrl}`));
  }
  
  if (sessionName) {
    pairingUrl += `&next=/sessions/mirror/${encodeURIComponent(sessionName)}`;
  }

  console.log(chalk.cyan('\n📱 Scan to pair and control this session:'));
  qrcode.generate(pairingUrl, { small: true });
  console.log(chalk.bold.underline(pairingUrl));
}

program.parse(process.argv);
