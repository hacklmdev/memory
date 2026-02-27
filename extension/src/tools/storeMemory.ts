import * as vscode from 'vscode';
import {
  readAllMemories,
  readCategoryMemories,
  appendMemory,
  upsertMemory,
  deleteMemory,
  writeConflictLog,
  CATEGORY_FILES,
  type MemoryEntry,
} from '../storage/markdownStore';
import { checkDuplicate } from '../storage/dedup';
import { findWeakest } from '../storage/scoring';
import { getEffectiveLimit } from '../utils';
import { resolveModel, sendLmRequest } from '../lm';
import { triggerGapAnalysis } from './sessionReview';
import { STORE_COUNT_KEY } from '../globalStateKeys';

const LLM_REDUNDANCY_TIMEOUT_MS = 5000;
const MAX_ENTRIES_PER_FILE_FOR_LLM = 20;

export interface StoreMemoryInput {
  category: 'Instruction' | 'Quirk' | 'Preference' | 'Decision' | 'Security';
  content: string;
  slug?: string;
}

export class StoreMemoryTool implements vscode.LanguageModelTool<StoreMemoryInput> {
  private readonly context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<StoreMemoryInput>,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    const { category, content, slug } = options.input;
    const slugLabel = slug ? ` [${slug}]` : '';
    const autoApprove = vscode.workspace
      .getConfiguration('hacklm-memory')
      .get<boolean>('autoApproveStore', false);

    if (autoApprove) {
      return {
        invocationMessage: `Saving to memory${slugLabel}…`,
      };
    }

    return {
      invocationMessage: `Saving to memory${slugLabel}…`,
      confirmationMessages: {
        title: `Save to Memory — ${category}`,
        message: new vscode.MarkdownString(
          `**${category}**${slugLabel}\n\n> ${content}\n\nStore this memory?`
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<StoreMemoryInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const { category, content, slug } = options.input;

    try {
      const allEntries = await readAllMemories();

      const dedupResult = checkDuplicate(content, allEntries, category);
      if (dedupResult.action === 'skip') {
        return this.textResult(
          `Already stored something similar (${Math.round(dedupResult.similarity * 100)}% match): "${dedupResult.matchedEntry?.content}"`
        );
      }

      if (!slug) {
        const llmVerdict = await this.llmRedundancyCheck(content, allEntries, _token);
        if (llmVerdict) {
          return this.textResult(
            `Already covered by existing entry in ${llmVerdict.file}: "${llmVerdict.content}"`
          );
        }
      }

      if (dedupResult.action === 'update' && dedupResult.matchedEntry) {
        const deleted = await deleteMemory(
          dedupResult.matchedEntry.category,
          dedupResult.matchedEntry.content,
          dedupResult.matchedEntry.slug
        );
        if (!deleted) {
          throw new Error(
            `Could not remove existing entry for update: "${dedupResult.matchedEntry.content}"`
          );
        }
      }

      const categoryEntries = await readCategoryMemories(category);
      const limit = getEffectiveLimit(category);
      if (categoryEntries.length >= limit) {
        const weakest = findWeakest(categoryEntries, 1);
        if (weakest.length > 0) {
          const victim = weakest[0].entry;
          await deleteMemory(victim.category, victim.content, victim.slug);
        }
      }

      let actionVerb: string;
      if (slug) {
        const existing = categoryEntries.find(e => e.slug === slug);
        if (existing) {
          this.checkNegationConflict(slug, existing, content, category);
        }
        const result = await upsertMemory(category, slug, content);
        actionVerb = result === 'updated' ? 'Updated' : 'Stored';
      } else {
        await appendMemory(category, content);
        actionVerb = dedupResult.action === 'update' ? 'Updated' : 'Stored';
      }

      await this.tickCleanupCounter();
      void vscode.commands.executeCommand('setContext', 'hacklm-memory.hasStoredMemory', true);

      void triggerGapAnalysis(
        { category, content, slug },
        allEntries,
        this.context
      );

      const updateNote =
        dedupResult.action === 'update'
          ? ` (replaced: "${dedupResult.matchedEntry?.content}")`
          : '';

      return this.textResult(
        `${actionVerb} in ${CATEGORY_FILES[category]}: "${content}"${updateNote}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.textResult(`Failed to store memory: ${message}`);
    }
  }

  private textResult(text: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(text),
    ]);
  }

  // Fails open: timeout / errors → null (proceed with write).
  private async llmRedundancyCheck(
    newContent: string,
    allEntries: MemoryEntry[],
    token: vscode.CancellationToken
  ): Promise<{ file: string; content: string } | null> {
    try {
      const grouped = this.groupEntriesForPrompt(allEntries);
      if (grouped.length === 0) { return null; }

      const prompt = [
        'You are a memory deduplication checker.',
        '',
        'Existing memories across all categories:',
        grouped,
        '',
        `New entry: "${newContent}"`,
        '',
        'Is this new entry fully covered by any existing entry above?',
        'Reply with exactly one line:',
        'COVERED:[filename]:[content of covering entry]',
        'or',
        'NEW',
      ].join('\n');

      const model = await resolveModel();
      if (!model) { return null; }

      const messages = [vscode.LanguageModelChatMessage.User(prompt)];
      const result = await sendLmRequest(model, messages, {
        justification: 'Checking whether this memory entry is already covered by an existing one.',
        token,
        timeoutMs: LLM_REDUNDANCY_TIMEOUT_MS,
      });
      if (!result) { return null; }

      const match = /^COVERED:([^:]+):(.+)$/.exec(result.trim());
      if (match) {
        return { file: match[1].trim(), content: match[2].trim() };
      }
      return null;
    } catch {
      return null;
    }
  }

  private groupEntriesForPrompt(entries: MemoryEntry[]): string {
    const byFile = new Map<string, MemoryEntry[]>();
    for (const entry of entries) {
      const arr = byFile.get(entry.file) ?? [];
      arr.push(entry);
      byFile.set(entry.file, arr);
    }

    const sections: string[] = [];
    for (const [file, fileEntries] of byFile) {
      const capped = fileEntries.slice(-MAX_ENTRIES_PER_FILE_FOR_LLM);
      const lines = capped.map(e =>
        e.slug ? `- [${e.slug}] ${e.content}` : `- ${e.content}`
      );
      sections.push(`[${file}]\n${lines.join('\n')}`);
    }
    return sections.join('\n\n');
  }

  private checkNegationConflict(
    slug: string,
    existing: MemoryEntry,
    newContent: string,
    category: string
  ): void {
    if (hasNegationFlip(existing.content, newContent)) {
      const file = CATEGORY_FILES[category];
      vscode.window.showInformationMessage(
        `[memory] Conflict on slug "${slug}": old entry overwritten. Review .memory/${file} if needed.`
      );
      writeConflictLog(file, slug, existing.content, newContent).catch(() => {});
    }
  }

  private async tickCleanupCounter(): Promise<void> {
    const config = vscode.workspace.getConfiguration('hacklm-memory');
    const frequency = config.get<number>('autoCleanupFrequency', 10);

    const count = (this.context.globalState.get<number>(STORE_COUNT_KEY) ?? 0) + 1;
    await this.context.globalState.update(STORE_COUNT_KEY, count);

    if (count >= frequency) {
      await this.context.globalState.update(STORE_COUNT_KEY, 0);
      // Run cleanup silently in background — don't block the tool response
      import('./cleanupMemory').then(m => m.runCleanup()).catch(() => {});
    }
  }
}

const NEGATION_PAIRS: [RegExp, RegExp][] = [
  [/\balways\b/i, /\bnever\b/i],
  [/\bdo\b/i, /\bdon'?t\b/i],
  [/\buse\b/i, /\bavoid\b/i],
  [/\bkeep\b/i, /\bremove\b/i],
  [/\ballow\b/i, /\bdisallow\b/i],
  [/\benable\b/i, /\bdisable\b/i],
];

function hasNegationFlip(oldText: string, newText: string): boolean {
  for (const [termA, termB] of NEGATION_PAIRS) {
    const oldHasA = termA.test(oldText);
    const oldHasB = termB.test(oldText);
    const newHasA = termA.test(newText);
    const newHasB = termB.test(newText);
    // One text uses termA and the other uses termB (or vice versa)
    if ((oldHasA && newHasB) || (oldHasB && newHasA)) { return true; }
  }
  return false;
}
