import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Per-file write locks — prevents concurrent read-then-write races when
 * two operations (e.g. store + background cleanup) touch the same file.
 */
const _fileLocks = new Map<string, Promise<void>>();

async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const prev = _fileLocks.get(filePath) ?? Promise.resolve();
  let releaseLock!: () => void;
  const lockHeld = new Promise<void>(resolve => { releaseLock = resolve; });
  // New callers chain after this lock so operations are serialised
  _fileLocks.set(filePath, lockHeld);
  await prev;
  try {
    return await fn();
  } finally {
    releaseLock();
    // Clean up map entry once we're the last holder
    if (_fileLocks.get(filePath) === lockHeld) {
      _fileLocks.delete(filePath);
    }
  }
}

/** Memory categories and their corresponding filenames */
export const CATEGORY_FILES: Record<string, string> = {
  'Instruction': 'instructions.md',
  'Quirk': 'quirks.md',
  'Preference': 'preferences.md',
  'Decision': 'decisions.md',
  'Security': 'security.md',
};

/** Maximum entries per category — keeps memory lean */
export const CATEGORY_LIMITS: Record<string, number> = {
  'Instruction': 10,
  'Quirk': 20,
  'Preference': 20,
  'Decision': 15,
  'Security': 15,
};

export interface MemoryEntry {
  date: string;
  content: string;
  category: string;
  lineNumber: number;
  /** Filename e.g. 'instructions.md' */
  file: string;
  /** Optional topic slug e.g. 'console-logs' — used for upsert identity */
  slug?: string;
}

/**
 * Resolve the .memory/ directory from the active workspace folder.
 */
export function getMemoryDir(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('No workspace folder open.');
  }
  return path.join(folder.uri.fsPath, '.memory');
}

/**
 * Ensure the .memory/ directory and all category files exist.
 */
export async function ensureMemoryDir(): Promise<void> {
  const memDir = getMemoryDir();
  await fs.mkdir(memDir, { recursive: true });

  for (const [category, filename] of Object.entries(CATEGORY_FILES)) {
    const filePath = path.join(memDir, filename);
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(
        filePath,
        `# ${category}\n\nMemories stored by HackLM Memory.\n\n`,
        'utf-8'
      );
    }
  }
}

/**
 * Append a memory entry to the appropriate category file.
 *
 * @param overrideDate  ISO date string (YYYY-MM-DD).  When provided the entry
 *                      keeps its original date (e.g. after a merge-update in
 *                      cleanup) rather than being stamped with today's date.
 */
export async function appendMemory(category: string, content: string, overrideDate?: string): Promise<void> {
  const filename = CATEGORY_FILES[category];
  if (!filename) {
    throw new Error(
      `Unknown category: ${category}. Valid: ${Object.keys(CATEGORY_FILES).join(', ')}`
    );
  }

  await ensureMemoryDir();
  const filePath = path.join(getMemoryDir(), filename);
  const entryDate = overrideDate ?? new Date().toISOString().split('T')[0];
  const entry = `\n## ${entryDate}\n- ${content.trim()}\n`;
  await withFileLock(filePath, () => fs.appendFile(filePath, entry, 'utf-8'));
}

/**
 * Insert or update a memory entry identified by slug.
 *
 * If an entry with the same slug already exists in the category file, it is
 * replaced. Otherwise a new entry is appended with the slug prefix.
 *
 * @returns 'inserted' | 'updated' — indicates what happened.
 */
export async function upsertMemory(
  category: string,
  slug: string,
  content: string,
  overrideDate?: string
): Promise<'inserted' | 'updated'> {
  const filename = CATEGORY_FILES[category];
  if (!filename) {
    throw new Error(
      `Unknown category: ${category}. Valid: ${Object.keys(CATEGORY_FILES).join(', ')}`
    );
  }

  await ensureMemoryDir();
  const filePath = path.join(getMemoryDir(), filename);
  const entryDate = overrideDate ?? new Date().toISOString().split('T')[0];
  const slugPrefix = `[${slug}] `;
  const bulletLine = `- ${slugPrefix}${content.trim()}`;

  return withFileLock(filePath, async () => {
    let text = '';
    try {
      text = await fs.readFile(filePath, 'utf-8');
    } catch {
      // File doesn't exist — will create it
    }

    const lines = text.split('\n');
    const slugPattern = new RegExp(`^- \\[${escapeRegex(slug)}\\]\\s`);
    let removedIndex = -1;
    let removedDateHeaderIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (slugPattern.test(lines[i].trim())) {
        removedIndex = i;
        // Check if the date header above is now orphaned (only entry under it)
        const headerIndex = findDateHeaderAbove(lines, i);
        if (headerIndex !== -1 && countEntriesUnderHeader(lines, headerIndex) === 1) {
          removedDateHeaderIndex = headerIndex;
        }
        break;
      }
    }

    if (removedIndex !== -1) {
      lines.splice(removedIndex, 1);
      // If the date header is now orphaned, remove it too
      if (removedDateHeaderIndex !== -1 && removedDateHeaderIndex < lines.length) {
        lines.splice(removedDateHeaderIndex, 1);
      }
      await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
    }

    const entry = `\n## ${entryDate}\n${bulletLine}\n`;
    await fs.appendFile(filePath, entry, 'utf-8');

    return removedIndex !== -1 ? 'updated' : 'inserted';
  });
}

function findDateHeaderAbove(lines: string[], bulletIndex: number): number {
  for (let i = bulletIndex - 1; i >= 0; i--) {
    if (/^## \d{4}-\d{2}-\d{2}/.test(lines[i])) { return i; }
    if (/^#\s/.test(lines[i])) { return -1; }
  }
  return -1;
}

function countEntriesUnderHeader(lines: string[], headerIndex: number): number {
  let count = 0;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { break; }
    if (lines[i].trim().startsWith('- ')) { count++; }
  }
  return count;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Append a conflict entry to .memory/conflicts.log for audit trail.
 */
export async function writeConflictLog(
  file: string,
  slug: string,
  oldContent: string,
  newContent: string
): Promise<void> {
  try {
    const logPath = path.join(getMemoryDir(), 'conflicts.log');
    const date = new Date().toISOString().split('T')[0];
    const line = `${date} | ${file} | ${slug} | OLD: "${oldContent}" | NEW: "${newContent}"\n`;
    await fs.appendFile(logPath, line, 'utf-8');
  } catch {
    // Non-fatal
  }
}

/**
 * Read all memory entries from a specific category file.
 */
export async function readCategoryMemories(category: string): Promise<MemoryEntry[]> {
  const filename = CATEGORY_FILES[category];
  if (!filename) { return []; }

  const filePath = path.join(getMemoryDir(), filename);
  try {
    const text = await fs.readFile(filePath, 'utf-8');
    return parseMemoryFile(text, category, filename);
  } catch {
    return [];
  }
}

/**
 * Read all memory entries across all categories.
 */
export async function readAllMemories(): Promise<MemoryEntry[]> {
  const all: MemoryEntry[] = [];
  for (const category of Object.keys(CATEGORY_FILES)) {
    const entries = await readCategoryMemories(category);
    all.push(...entries);
  }
  return all;
}

/**
 * Parse a markdown memory file into structured entries.
 */
function parseMemoryFile(text: string, category: string, file: string): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const lines = text.split('\n');
  let currentDate = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const dateMatch = line.match(/^## (\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }

    const bulletMatch = line.match(/^- (.+)/);
    if (bulletMatch && currentDate) {
      const raw = bulletMatch[1].trim();
      const slugMatch = raw.match(/^\[([^\]]+)\]\s+(.+)/);
      entries.push({
        date: currentDate,
        content: slugMatch ? slugMatch[2] : raw,
        category,
        lineNumber: i + 1,
        file,
        slug: slugMatch ? slugMatch[1] : undefined,
      });
    }
  }

  return entries;
}

/**
 * Delete a specific memory entry by category, date, and content.
 */
export async function deleteMemory(
  category: string,
  date: string,
  content: string
): Promise<boolean> {
  const filename = CATEGORY_FILES[category];
  if (!filename) { return false; }

  const filePath = path.join(getMemoryDir(), filename);
  return withFileLock(filePath, async () => {
    try {
      const text = await fs.readFile(filePath, 'utf-8');
      const lines = text.split('\n');
      const target = `- ${content.trim()}`;

      let inDateSection = false;
      let removedIndex = -1;

      for (let i = 0; i < lines.length; i++) {
        const dateMatch = lines[i].match(/^## (\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          inDateSection = dateMatch[1] === date;
          continue;
        }
        if (inDateSection && lines[i].trim() === target) {
          removedIndex = i;
          break;
        }
      }

      if (removedIndex === -1) { return false; }

      lines.splice(removedIndex, 1);
      await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Get total memory count (for status bar).
 */
export async function getMemoryCount(): Promise<number> {
  try {
    const entries = await readAllMemories();
    return entries.length;
  } catch {
    return 0;
  }
}

/**
 * Show a QuickPick list of all memories.
 */
export async function showMemoryList(): Promise<void> {
  const entries = await readAllMemories();

  if (entries.length === 0) {
    vscode.window.showInformationMessage('No memories stored yet.');
    return;
  }

  const items = entries.map(e => ({
    label: `$(tag) [${e.category}]`,
    description: e.content,
    detail: `${e.date} — ${e.file}`,
    entry: e,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Stored memories',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (selected) {
    const filePath = path.join(getMemoryDir(), selected.entry.file);
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
  }
}

/**
 * Show a QuickPick to delete a memory entry interactively.
 */
export async function deleteMemoryInteractive(): Promise<void> {
  const entries = await readAllMemories();

  if (entries.length === 0) {
    vscode.window.showInformationMessage('No memories to delete.');
    return;
  }

  const items = entries.map(e => ({
    label: `$(trash) [${e.category}]`,
    description: e.content,
    detail: `${e.date} — ${e.file}`,
    entry: e,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a memory to delete',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!selected) { return; }

  const confirm = await vscode.window.showWarningMessage(
    `Delete memory: "${selected.entry.content}"?`,
    { modal: true },
    'Delete'
  );

  if (confirm !== 'Delete') { return; }

  const deleted = await deleteMemory(
    selected.entry.category,
    selected.entry.date,
    selected.entry.content
  );

  if (deleted) {
    vscode.window.showInformationMessage('Memory deleted.');
  } else {
    vscode.window.showErrorMessage('Failed to delete memory — entry not found.');
  }
}

/**
 * Open the .memory/ folder in the Explorer.
 */
export async function openMemoryFolder(): Promise<void> {
  let memDir: string;
  try {
    memDir = getMemoryDir();
  } catch {
    vscode.window.showErrorMessage('No workspace folder found.');
    return;
  }
  const uri = vscode.Uri.file(memDir);
  await vscode.commands.executeCommand('revealInExplorer', uri);
}
