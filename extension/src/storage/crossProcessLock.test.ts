import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import {
  withCrossProcessLock,
  isStale,
  clearStaleLockOnStartup,
  STALE_MS,
} from './crossProcessLock';

const LOCK_FILE = '.lock';

function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function makeTempDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `cpl-test-${crypto.randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * A racy read-modify-write: reads a file, sleeps (forcing all parallel callers
 * to observe the same stale state), then writes back with the entry appended.
 * Without a lock, the final file contains only the last writer's view.
 */
async function racingWrite(filePath: string, entry: string): Promise<void> {
  let text = '';
  try { text = await fs.readFile(filePath, 'utf-8'); } catch { /* empty file is fine */ }
  const lines = text ? text.split('\n').filter(Boolean) : [];
  await sleep(10); // ensures all readers finish before any writer starts
  lines.push(entry);
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
}

// ─── test suite ─────────────────────────────────────────────────────────────

describe('crossProcessLock', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      try { await fs.rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  async function useTempDir(): Promise<string> {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    return dir;
  }

  // ── Group 1: prove the bug ──────────────────────────────────────────────

  describe('without a lock: data is lost', () => {
    it('last writer wins when concurrent writes race without a lock', async () => {
      const dir = await useTempDir();
      const filePath = path.join(dir, 'test.md');
      await fs.writeFile(filePath, '', 'utf-8');

      const writers = ['a', 'b', 'c', 'd', 'e'];
      await Promise.all(writers.map(entry => racingWrite(filePath, entry)));

      const text = await fs.readFile(filePath, 'utf-8');
      const lines = text.split('\n').filter(Boolean);

      // All writers read the same empty state, then all overwrite each other.
      // The result is fewer than 5 entries — proving data loss.
      expect(lines.length).toBeLessThan(writers.length);
    });
  });

  // ── Group 2: prove the fix ──────────────────────────────────────────────

  describe('withCrossProcessLock: all writes land', () => {
    it('serialises concurrent writers so no entry is lost', async () => {
      const dir = await useTempDir();
      const filePath = path.join(dir, 'test.md');
      await fs.writeFile(filePath, '', 'utf-8');

      const writers = ['a', 'b', 'c', 'd', 'e'];
      await Promise.all(
        writers.map(entry =>
          withCrossProcessLock(dir, () => racingWrite(filePath, entry))
        )
      );

      const text = await fs.readFile(filePath, 'utf-8');
      const lines = text.split('\n').filter(Boolean);

      expect(lines.length).toBe(writers.length);
      expect([...lines].sort()).toEqual([...writers].sort());
    });

    it('removes the lock file after successful completion', async () => {
      const dir = await useTempDir();
      await withCrossProcessLock(dir, async () => { /* no-op */ });
      const lockPath = path.join(dir, LOCK_FILE);
      await expect(fs.access(lockPath)).rejects.toThrow();
    });

    it('removes the lock file even when fn throws', async () => {
      const dir = await useTempDir();
      const lockPath = path.join(dir, LOCK_FILE);
      await expect(
        withCrossProcessLock(dir, async () => { throw new Error('boom'); })
      ).rejects.toThrow('boom');
      await expect(fs.access(lockPath)).rejects.toThrow();
    });
  });

  // ── Group 3: stale lock recovery ────────────────────────────────────────

  describe('stale lock recovery', () => {
    it('removes a stale lock (dead PID + old timestamp) and proceeds', async () => {
      const dir = await useTempDir();
      const lockPath = path.join(dir, LOCK_FILE);
      await fs.writeFile(
        lockPath,
        JSON.stringify({ pid: 99999999, ts: Date.now() - (STALE_MS + 1000) }),
        'utf-8'
      );

      let ran = false;
      await withCrossProcessLock(dir, async () => { ran = true; });
      expect(ran).toBe(true);
    });

    it('clearStaleLockOnStartup removes a stale lock', async () => {
      const dir = await useTempDir();
      const lockPath = path.join(dir, LOCK_FILE);
      await fs.writeFile(
        lockPath,
        JSON.stringify({ pid: 99999999, ts: Date.now() - (STALE_MS + 1000) }),
        'utf-8'
      );

      await clearStaleLockOnStartup(dir);
      await expect(fs.access(lockPath)).rejects.toThrow();
    });

    it('clearStaleLockOnStartup leaves a fresh live lock untouched', async () => {
      const dir = await useTempDir();
      const lockPath = path.join(dir, LOCK_FILE);
      await fs.writeFile(
        lockPath,
        JSON.stringify({ pid: process.pid, ts: Date.now() }),
        'utf-8'
      );

      await clearStaleLockOnStartup(dir);
      // Lock should still be present — this process is alive and the lock is fresh
      await expect(fs.access(lockPath)).resolves.not.toThrow();
    });

    it('clearStaleLockOnStartup is a no-op when no lock file exists', async () => {
      const dir = await useTempDir();
      await expect(clearStaleLockOnStartup(dir)).resolves.not.toThrow();
    });
  });

  // ── Group 4: isStale unit tests ─────────────────────────────────────────

  describe('isStale', () => {
    it('returns true for a non-existent PID', () => {
      expect(isStale({ pid: 99999999, ts: Date.now() })).toBe(true);
    });

    it('returns false for the current process with a fresh timestamp', () => {
      expect(isStale({ pid: process.pid, ts: Date.now() })).toBe(false);
    });

    it('returns true when age exceeds STALE_MS even if PID is alive', () => {
      expect(isStale({ pid: process.pid, ts: Date.now() - (STALE_MS + 1) })).toBe(true);
    });

    it('returns true for a dead PID with a fresh timestamp', () => {
      // No process with PID 99999999 — dead PID alone is sufficient
      expect(isStale({ pid: 99999999, ts: Date.now() })).toBe(true);
    });
  });
});
