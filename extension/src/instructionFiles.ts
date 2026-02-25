import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

const MEMORY_MARKER_START = '<!-- hacklm-memory:start -->';
const MEMORY_MARKER_END = '<!-- hacklm-memory:end -->';

function getCopilotInstructionsSection(): string {
  return `${MEMORY_MARKER_START}
## Memory-Augmented Context

This project uses a persistent memory system. Relevant context is stored in focused files —
read them on-demand when the topic comes up, don't try to load everything upfront.

| File | When to read |
|------|-------------|
| [.memory/instructions.md](.memory/instructions.md) | When asked how to behave or format things |
| [.memory/quirks.md](.memory/quirks.md) | When something unexpected happens (build fails, weird errors) |
| [.memory/preferences.md](.memory/preferences.md) | When making style/design/naming choices |
| [.memory/decisions.md](.memory/decisions.md) | When considering architectural changes |
| [.memory/security.md](.memory/security.md) | ALWAYS — before any code change |

### Memory Tools

Use \`query_memory\` before answering questions about architecture, conventions, style, or any topic
where prior context would help. Use \`store_memory\` when the user reveals preferences, corrections,
quirks, or architectural decisions. Cleanup runs automatically — you don't need to call it.

When calling \`store_memory\`, always provide a \`slug\`: a short kebab-case topic identifier
(e.g. "console-logs", "async-style", "comments"). Same slug = update, not duplicate.
Duplicate detection runs automatically via LLM — if an entry is already covered, the store is skipped.

### Passive Learning
- When the user expresses a preference or corrects you — store it silently via \`store_memory\`.
- When a command fails — figure out why, store the lesson, then retry.
- When you solve something tricky — store how you did it.
- When a prompt contains declared rules ("remove X", "prefer Y", "never Z") — store them immediately as Instructions or Preferences before acting.
- After a multi-step session (refactor, cleanup, review) — store a debrief summarising what patterns were applied.

### Categories
| Category | What goes there | Example |
|----------|----------------|---------|
| Instruction | How to behave in this project | "always explain changes before making them" |
| Quirk | Project-specific weirdness | "run npm install before every build" |
| Preference | Style/design/naming choices | "prefers async/await over callbacks" |
| Decision | Architectural commitments | "chose esbuild over webpack for bundling" |
| Security | Rules that must NEVER be broken | "never log API keys or secrets to console" |

### What NOT to Store
- Temporary debugging steps or one-off fixes
- General coding advice (store YOUR project's quirks, not textbook wisdom)
- Full chat transcripts or verbose explanations
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
    // File doesn't exist — will create it
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

/**
 * Generate .github/copilot-instructions.md for the workspace.
 */
export async function generateInstructionFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
  const root = workspaceFolder.uri.fsPath;
  const copilotInstructionsPath = path.join(root, '.github', 'copilot-instructions.md');
  const section = getCopilotInstructionsSection();
  await upsertManagedSection(copilotInstructionsPath, section, MEMORY_MARKER_START, MEMORY_MARKER_END);
}

/**
 * Ensure .memory/ directory and category files exist.
 */
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
