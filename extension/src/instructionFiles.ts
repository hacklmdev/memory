import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { getOutputChannel } from './outputChannel';

const MEMORY_MARKER_START = '<!-- hacklm-memory:start -->';
const MEMORY_MARKER_END = '<!-- hacklm-memory:end -->';

/** Tools added to the Copilot Plan agent on every activation. */
const PLAN_AGENT_MEMORY_TOOLS = ['queryMemory', 'storeMemory'] as const;

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

function getPlanAgentMemorySection(): string {
  return `${MEMORY_MARKER_START}
## Memory Context

Call \`#queryMemory\` at the start of every planning session to retrieve relevant project decisions, conventions, and constraints before researching or drafting.

Call \`#storeMemory\` when the planning discussion surfaces a new architectural decision or constraint not yet in memory. Store it **before presenting the plan**, while the rationale is still in context.

Memory categories most relevant during planning:
- **Security** — constraints the plan must never violate (always query first)
- **Decision** — prior architectural commitments the plan must respect
- **Instruction** — how the team expects work to be approached
${MEMORY_MARKER_END}`;
}

/**
 * Patches the Copilot Chat built-in Plan agent to include memory tools.
 * Runs on every activation — idempotent. Silent no-op if Copilot Chat is not installed.
 */
export async function patchPlanAgent(context: vscode.ExtensionContext): Promise<void> {
  const planAgentPath = path.join(
    context.globalStorageUri.fsPath,
    '..',
    'github.copilot-chat',
    'plan-agent',
    'Plan.agent.md'
  );

  let content: string;
  try {
    content = await fs.readFile(planAgentPath, 'utf-8');
  } catch {
    // Copilot Chat not installed or Plan agent absent — silent no-op
    return;
  }

  let patched = content;

  // Add memory tools to the tools: array if not already present
  const toolsLineMatch = /^tools: \[(.+)\]$/m.exec(patched);
  if (toolsLineMatch) {
    const existing = toolsLineMatch[1];
    const toolsToAdd = PLAN_AGENT_MEMORY_TOOLS.filter(t => !existing.includes(`'${t}'`));
    if (toolsToAdd.length > 0) {
      const addition = toolsToAdd.map(t => `'${t}'`).join(', ');
      patched = patched.replace(
        toolsLineMatch[0],
        `tools: [${existing}, ${addition}]`
      );
    }
  }

  // Inject/update the memory instructions section in the agent body
  const section = getPlanAgentMemorySection();
  if (patched.includes(MEMORY_MARKER_START) && patched.includes(MEMORY_MARKER_END)) {
    const startIdx = patched.indexOf(MEMORY_MARKER_START);
    const endIdx = patched.indexOf(MEMORY_MARKER_END) + MEMORY_MARKER_END.length;
    patched = patched.substring(0, startIdx) + section + patched.substring(endIdx);
  } else {
    if (!patched.endsWith('\n')) { patched += '\n'; }
    patched += '\n' + section + '\n';
  }

  if (patched !== content) {
    await fs.writeFile(planAgentPath, patched, 'utf-8');
    getOutputChannel().appendLine('[HackLM Memory] Patched Plan agent with memory tools.');
  }
}

export async function generateInstructionFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
  const root = workspaceFolder.uri.fsPath;
  const copilotInstructionsPath = path.join(root, '.github', 'copilot-instructions.md');
  const section = getCopilotInstructionsSection();
  await upsertManagedSection(copilotInstructionsPath, section, MEMORY_MARKER_START, MEMORY_MARKER_END);
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
