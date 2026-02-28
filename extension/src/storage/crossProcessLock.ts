import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const LOCK_FILE = '.lock';

/** How long before a lock is considered abandoned (ms). */
export const STALE_MS = 10_000;

/** Max attempts to acquire the lock before giving up. */
const MAX_RETRIES = 20;

/** Base delay between retries — multiplied by attempt number (linear back-off). */
const RETRY_BASE_MS = 50;

interface LockContent {
  pid: number;
  ts: number;
}

/**
 * Returns true when a lock entry should be considered abandoned.
 * Two conditions either of which is sufficient:
 *   1. Age > STALE_MS  — the process holding it has been gone long enough.
 *   2. PID is not alive — verified via process.kill(pid, 0).
 */
export function isStale(content: LockContent): boolean {
  if (Date.now() - content.ts > STALE_MS) { return true; }
  try {
    // Sends signal 0: no signal delivered, but OS checks if PID exists.
    // Throws with code ESRCH when the process does not exist.
    process.kill(content.pid, 0);
    return false; // process is alive
  } catch {
    return true; // ESRCH: process not found
  }
}

async function readLockContent(lockPath: string): Promise<LockContent | null> {
  try {
    const text = await fs.readFile(lockPath, 'utf-8');
    return JSON.parse(text) as LockContent;
  } catch {
    return null;
  }
}

/**
 * Acquires an advisory lockfile in `memoryDir`.
 * Returns a release function that removes the lock file.
 *
 * Uses `fs.open(path, 'wx')` — exclusive create — which is atomic on all
 * POSIX filesystems and NTFS. Only one caller can create the file; all others
 * get EEXIST and must wait or detect staleness.
 */
async function acquireLock(memoryDir: string): Promise<() => Promise<void>> {
  const lockPath = path.join(memoryDir, LOCK_FILE);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const fh = await fs.open(lockPath, 'wx');
      await fh.writeFile(JSON.stringify({ pid: process.pid, ts: Date.now() }), 'utf-8');
      await fh.close();
      return async () => {
        try { await fs.unlink(lockPath); } catch { /* ignore — already removed */ }
      };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw err; // unexpected error — propagate
      }

      // Lock file exists — check if the holder is still alive
      const content = await readLockContent(lockPath);
      if (content && isStale(content)) {
        try { await fs.unlink(lockPath); } catch { /* another process removed it first */ }
        continue; // retry immediately without sleeping
      }

      // Holder is alive — wait with linear back-off
      await new Promise<void>(resolve => setTimeout(resolve, RETRY_BASE_MS * (attempt + 1)));
    }
  }

  throw new Error(
    `[crossProcessLock] Could not acquire lock after ${MAX_RETRIES} retries: ${lockPath}`
  );
}

/**
 * Acquires a directory-level advisory lock, runs `fn`, then releases the lock.
 * Safe across processes: uses an exclusive lockfile rather than an in-process Map.
 */
export async function withCrossProcessLock<T>(
  memoryDir: string,
  fn: () => Promise<T>
): Promise<T> {
  const release = await acquireLock(memoryDir);
  try {
    return await fn();
  } finally {
    await release();
  }
}

/**
 * Called at extension startup — cleans up a stale lockfile left behind by a
 * crashed process so that the extension does not block indefinitely on first use.
 * Non-fatal: all errors are silently ignored.
 */
export async function clearStaleLockOnStartup(memoryDir: string): Promise<void> {
  try {
    const lockPath = path.join(memoryDir, LOCK_FILE);
    const content = await readLockContent(lockPath);
    if (content && isStale(content)) {
      await fs.unlink(lockPath);
    }
  } catch {
    // Non-fatal
  }
}
