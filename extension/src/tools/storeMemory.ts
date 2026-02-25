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

const LLM_REDUNDANCY_TIMEOUT_MS = 5000;
const MAX_ENTRIES_PER_FILE_FOR_LLM = 20;

export interface StoreMemoryInput {
  category: 'Instruction' | 'Quirk' | 'Preference' | 'Decision' | 'Security';
  content: string;
  slug?: string;
}

export class StoreMemoryTool implements vscode.LanguageModelTool<StoreMemoryInput> {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<StoreMemoryInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const { category, content, slug } = options.input;

    try {
      const allEntries = await readAllMemories();

      // Fast local dedup (keyword overlap within same category)
      const dedupResult = checkDuplicate(content, allEntries, category);
      if (dedupResult.action === 'skip') {
        return this.textResult(
          `Already stored something similar (${Math.round(dedupResult.similarity * 100)}% match): "${dedupResult.matchedEntry?.content}"`
        );
      }

      // LLM redundancy check across all files (5s timeout, fail open)
      if (!slug) {
        const llmVerdict = await this.llmRedundancyCheck(content, allEntries);
        if (llmVerdict) {
          return this.textResult(
            `Already covered by existing entry in ${llmVerdict.file}: "${llmVerdict.content}"`
          );
        }
      }

      // Handle keyword-dedup 'update' action (delete old entry before writing)
      if (dedupResult.action === 'update' && dedupResult.matchedEntry) {
        const deleted = await deleteMemory(
          dedupResult.matchedEntry.category,
          dedupResult.matchedEntry.date,
          dedupResult.matchedEntry.content
        );
        if (!deleted) {
          throw new Error(
            `Could not remove existing entry for update: "${dedupResult.matchedEntry.content}"`
          );
        }
      }

      // Enforce category limit — evict weakest entry if at capacity
      const categoryEntries = await readCategoryMemories(category);
      const limit = getEffectiveLimit(category);
      if (categoryEntries.length >= limit) {
        const weakest = findWeakest(categoryEntries, 1);
        if (weakest.length > 0) {
          const victim = weakest[0].entry;
          await deleteMemory(victim.category, victim.date, victim.content);
        }
      }

      // Write: slug path uses upsert, legacy path uses append
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

  /**
   * Ask an LLM whether the new content is already covered by any existing
   * entry across all memory files. Returns the covering entry or null.
   * Fails open: timeout / errors → null (proceed with write).
   */
  private async llmRedundancyCheck(
    newContent: string,
    allEntries: MemoryEntry[]
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

      const models = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
      const model = models[0];
      if (!model) { return null; }

      const messages = [vscode.LanguageModelChatMessage.User(prompt)];
      const response = await Promise.race([
        model.sendRequest(messages, {}),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), LLM_REDUNDANCY_TIMEOUT_MS)),
      ]);

      if (!response || !('text' in response)) { return null; }

      let result = '';
      for await (const chunk of response.text) {
        result += chunk;
      }

      const match = /^COVERED:([^:]+):(.+)$/.exec(result.trim());
      if (match) {
        return { file: match[1].trim(), content: match[2].trim() };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Format entries as a prompt section, capped at MAX_ENTRIES_PER_FILE_FOR_LLM per file.
   */
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

  /**
   * If overwriting a slug, check for negation conflicts (e.g. "always X" vs "never X").
   * Non-blocking toast + audit log. Latest entry always wins.
   */
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

  /**
   * Increment the store counter and trigger auto-cleanup when the threshold is reached.
   */
  private async tickCleanupCounter(): Promise<void> {
    const key = 'hacklm-memory.storeCount';
    const config = vscode.workspace.getConfiguration('hacklm-memory');
    const frequency = config.get<number>('autoCleanupFrequency', 10);

    const count = (this.context.globalState.get<number>(key) ?? 0) + 1;
    await this.context.globalState.update(key, count);

    if (count >= frequency) {
      await this.context.globalState.update(key, 0);
      // Run cleanup silently in background — don't block the tool response
      import('./cleanupMemory').then(m => m.runCleanup(false)).catch(() => {});
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
