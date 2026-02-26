import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

const MEMORY_MARKER_START = '<!-- hacklm-memory:start -->';
const MEMORY_MARKER_END = '<!-- hacklm-memory:end -->';

function getCopilotInstructionsSection(): string {
  return `${MEMORY_MARKER_START}
## Memory-Augmented Context

Read memory files on-demand — not all at once.

| File | When to read |
|------|-------------|
| [.memory/instructions.md](.memory/instructions.md) | How to behave |
| [.memory/quirks.md](.memory/quirks.md) | When something breaks unexpectedly |
| [.memory/preferences.md](.memory/preferences.md) | Style/design/naming choices |
| [.memory/decisions.md](.memory/decisions.md) | Architectural changes |
| [.memory/security.md](.memory/security.md) | **ALWAYS — before any code change** |

### Memory Tools

Call \`queryMemory\` before answering anything about architecture, conventions, or style.

Call \`storeMemory\` (with a kebab-case \`slug\`) when:
1. User states a preference or rule → store as Instruction or Preference **before** acting
2. User corrects you → store the correction
3. A command or build fails → store root cause and fix
4. After completing any implementation task → store each architectural decision, convention, or pattern applied that is not already in memory. Do this **before ending the turn**.

Same slug = update, not duplicate.

### Writing Style for Memory Entries
Hemingway style. Short sentences. No jargon. No filler. Be blunt.
Bad: "The system employs an asynchronous locking mechanism to serialise concurrent write operations."
Good: "Use a lock before writing. One write at a time."

### Categories
| Category | Use for |
|----------|---------|
| Instruction | How to behave |
| Quirk | Project-specific weirdness |
| Preference | Style/design/naming |
| Decision | Architectural commitments |
| Security | Rules that must NEVER be broken |
${MEMORY_MARKER_END}`;
}


async function upsertManagedSection(
  filePath: string,
  section: string,
  markerStart: string,
  markerEnd: string
): Promise<void> {
  let content = '';
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    // file will be created below
  }

  if (content.includes(markerStart) && content.includes(markerEnd)) {
    const startIdx = content.indexOf(markerStart);
    const endIdx = content.indexOf(markerEnd) + markerEnd.length;
    content = content.substring(0, startIdx) + section + content.substring(endIdx);
  } else {
    if (content.length > 0 && !content.endsWith('\n')) {
      content += '\n';
    }
    content += '\n' + section + '\n';
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

const COPILOT_MEMORY_MARKER_START = '<!-- copilot-memory:start -->';
const COPILOT_MEMORY_MARKER_END = '<!-- copilot-memory:end -->';

/**
 * Remove the legacy copilot-memory block if present — it duplicates hacklm-memory
 * with weaker (and now contradictory) passive-learning language.
 */
function stripLegacyCopilotMemoryBlock(content: string): string {
  if (!content.includes(COPILOT_MEMORY_MARKER_START)) { return content; }
  const start = content.indexOf(COPILOT_MEMORY_MARKER_START);
  const end = content.indexOf(COPILOT_MEMORY_MARKER_END);
  if (end === -1) { return content; }
  const removed = content.substring(0, start) + content.substring(end + COPILOT_MEMORY_MARKER_END.length);
  return removed.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export async function generateInstructionFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
  const root = workspaceFolder.uri.fsPath;
  const copilotInstructionsPath = path.join(root, '.github', 'copilot-instructions.md');
  const section = getCopilotInstructionsSection();
  await upsertManagedSection(copilotInstructionsPath, section, MEMORY_MARKER_START, MEMORY_MARKER_END);

  // Strip the legacy copilot-memory block which VS Code's built-in memory feature may have injected
  const current = await fs.readFile(copilotInstructionsPath, 'utf-8').catch(() => '');
  const cleaned = stripLegacyCopilotMemoryBlock(current);
  if (cleaned !== current) {
    await fs.writeFile(copilotInstructionsPath, cleaned, 'utf-8');
  }
}

export async function ensureMemoryFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
  const memDir = path.join(workspaceFolder.uri.fsPath, '.memory');
  await fs.mkdir(memDir, { recursive: true });

  const categories: Record<string, string> = {
    'instructions.md': '# Instructions\n\nHow Copilot should behave in this project.\n\n',
    'quirks.md': '# Quirks\n\nProject-specific weirdness — the non-obvious stuff.\n\n',
    'preferences.md': '# Preferences\n\nStyle, tone, and design choices for this project.\n\n',
    'decisions.md': '# Decisions\n\nArchitectural commitments made in this project.\n\n',
    'security.md': '# Security\n\nRules that must NEVER be broken. Always read this file.\n\n',
  };

  for (const [filename, header] of Object.entries(categories)) {
    const filePath = path.join(memDir, filename);
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, header, 'utf-8');
    }
  }
}
