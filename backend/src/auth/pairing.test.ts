import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db } from '../db/index.js';

const dbPath = path.join(os.tmpdir(), `cloudcode-pairing-test-${Date.now()}.db`);
process.env.DATABASE_PATH = dbPath;

describe('Pairing Token Service', () => {
  let authService: any;
  let userId: string;

  beforeAll(async () => {
    const { runMigrations } = await import('../db/migrations.js');
    authService = await import('./service.js');
    runMigrations();

    const user = authService.createUser('testuser', 'hash', true);
    userId = user.id;
  });

  afterAll(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
    if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);
  });

  it('creates and consumes a pairing token', () => {
    const token = authService.createPairingToken(userId);
    expect(token).toBeDefined();
    expect(token.length).toBeGreaterThan(16);

    const consumedUserId = authService.consumePairingToken(token);
    expect(consumedUserId).toBe(userId);

    // Should not be able to consume twice
    const secondTry = authService.consumePairingToken(token);
    expect(secondTry).toBeNull();
  });

  it('fails for non-existent tokens', () => {
    const result = authService.consumePairingToken('invalid-token');
    expect(result).toBeNull();
  });

  it('invalidates all tokens for a user after one is consumed', () => {
    const token1 = authService.createPairingToken(userId);
    const token2 = authService.createPairingToken(userId);

    authService.consumePairingToken(token1);
    
    const result2 = authService.consumePairingToken(token2);
    expect(result2).toBeNull();
  });
});
