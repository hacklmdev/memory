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

export const CATEGORY_FILES: Record<string, string> = {
  'Instruction': 'instructions.md',
  'Quirk': 'quirks.md',
  'Preference': 'preferences.md',
  'Decision': 'decisions.md',
  'Security': 'security.md',
};

export const CATEGORY_LIMITS: Record<string, number> = {
  'Instruction': 10,
  'Quirk': 20,
  'Preference': 20,
  'Decision': 15,
  'Security': 15,
};

export interface MemoryEntry {
  content: string;
  category: string;
  lineNumber: number;
  file: string;
  slug?: string;
}

export function getMemoryDir(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('No workspace folder open.');
  }
  return path.join(folder.uri.fsPath, '.memory');
}

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

export async function appendMemory(category: string, content: string): Promise<void> {
  const filename = CATEGORY_FILES[category];
  if (!filename) {
    throw new Error(
      `Unknown category: ${category}. Valid: ${Object.keys(CATEGORY_FILES).join(', ')}`
    );
  }

  await ensureMemoryDir();
  const filePath = path.join(getMemoryDir(), filename);
  await withFileLock(filePath, () => fs.appendFile(filePath, `\n- ${content.trim()}\n`, 'utf-8'));
}

export async function upsertMemory(
  category: string,
  slug: string,
  content: string
): Promise<'inserted' | 'updated'> {
  const filename = CATEGORY_FILES[category];
  if (!filename) {
    throw new Error(
      `Unknown category: ${category}. Valid: ${Object.keys(CATEGORY_FILES).join(', ')}`
    );
  }

  await ensureMemoryDir();
  const filePath = path.join(getMemoryDir(), filename);
  const bulletLine = `- [${slug}] ${content.trim()}`;

  return withFileLock(filePath, async () => {
    let text = '';
    try {
      text = await fs.readFile(filePath, 'utf-8');
    } catch {
      // File doesn't exist — will create it
    }

    const lines = stripDateHeaders(text).split('\n');
    const slugPattern = new RegExp(`^- \\[${escapeRegex(slug)}\\]\\s`);
    const removedIndex = lines.findIndex(l => slugPattern.test(l.trim()));

    if (removedIndex !== -1) {
      lines.splice(removedIndex, 1);
      await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
    }

    await fs.appendFile(filePath, `\n${bulletLine}\n`, 'utf-8');
    return removedIndex !== -1 ? 'updated' : 'inserted';
  });
}

export async function migrateFiles(): Promise<void> {
  const memDir = getMemoryDir();
  for (const filename of Object.values(CATEGORY_FILES)) {
    const filePath = path.join(memDir, filename);
    try {
      const text = await fs.readFile(filePath, 'utf-8');
      const migrated = stripDateHeaders(text);
      if (migrated !== text) {
        await withFileLock(filePath, () => fs.writeFile(filePath, migrated, 'utf-8'));
      }
    } catch {
      // File doesn't exist — skip
    }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove any legacy `## YYYY-MM-DD` date headers from file text.
 * Called on every read-modify-write so old-format files are migrated
 * transparently the first time they are touched.
 */
function stripDateHeaders(text: string): string {
  return text
    .split('\n')
    .filter(l => !/^## \d{4}-\d{2}-\d{2}/.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

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

export async function readAllMemories(): Promise<MemoryEntry[]> {
  const all: MemoryEntry[] = [];
  for (const category of Object.keys(CATEGORY_FILES)) {
    const entries = await readCategoryMemories(category);
    all.push(...entries);
  }
  return all;
}

function parseMemoryFile(text: string, category: string, file: string): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const bulletMatch = lines[i].match(/^- (.+)/);
    if (!bulletMatch) { continue; }
    const raw = bulletMatch[1].trim();
    const slugMatch = raw.match(/^\[([^\]]+)\]\s+(.+)/);
    entries.push({
      content: slugMatch ? slugMatch[2] : raw,
      category,
      lineNumber: i + 1,
      file,
      slug: slugMatch ? slugMatch[1] : undefined,
    });
  }

  return entries;
}

export async function deleteMemory(
  category: string,
  content: string,
  slug?: string
): Promise<boolean> {
  const filename = CATEGORY_FILES[category];
  if (!filename) { return false; }

  const filePath = path.join(getMemoryDir(), filename);
  return withFileLock(filePath, async () => {
    try {
      const text = await fs.readFile(filePath, 'utf-8');
      const lines = stripDateHeaders(text).split('\n');
      const slugPrefix = slug ? `[${slug}] ` : '';
      const target = `- ${slugPrefix}${content.trim()}`;
      const removedIndex = lines.findIndex(l => l.trim() === target);
      if (removedIndex === -1) { return false; }
      lines.splice(removedIndex, 1);
      await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
      return true;
    } catch {
      return false;
    }
  });
}

export async function getMemoryCount(): Promise<number> {
  try {
    const entries = await readAllMemories();
    return entries.length;
  } catch {
    return 0;
  }
}

export async function showMemoryList(): Promise<void> {
  const entries = await readAllMemories();

  if (entries.length === 0) {
    vscode.window.showInformationMessage('No memories stored yet.');
    return;
  }

  const items = entries.map(e => ({
    label: `$(tag) [${e.category}]`,
    description: e.content,
    detail: e.file,
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

export async function deleteMemoryInteractive(): Promise<void> {
  const entries = await readAllMemories();

  if (entries.length === 0) {
    vscode.window.showInformationMessage('No memories to delete.');
    return;
  }

  const items = entries.map(e => ({
    label: `$(trash) [${e.category}]`,
    description: e.content,
    detail: e.file,
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
    selected.entry.content,
    selected.entry.slug
  );

  if (deleted) {
    vscode.window.showInformationMessage('Memory deleted.');
  } else {
    vscode.window.showErrorMessage('Failed to delete memory — entry not found.');
  }
}

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
