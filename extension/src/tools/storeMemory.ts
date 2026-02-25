import * as vscode from 'vscode';
import {
  readAllMemories,
  readCategoryMemories,
  appendMemory,
  deleteMemory,
  CATEGORY_FILES,
} from '../storage/markdownStore';
import { checkDuplicate } from '../storage/dedup';
import { findWeakest } from '../storage/scoring';
import { getEffectiveLimit } from '../utils';

export interface StoreMemoryInput {
  category: 'Instruction' | 'Quirk' | 'Preference' | 'Decision' | 'Security';
  content: string;
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
    const { category, content } = options.input;

    try {
      // Step 1: Dedup check
      const existing = await readAllMemories();
      const dedupResult = checkDuplicate(content, existing, category);

      if (dedupResult.action === 'skip') {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            `Already stored something similar (${Math.round(dedupResult.similarity * 100)}% match): "${dedupResult.matchedEntry?.content}"`
          ),
        ]);
      }

      if (dedupResult.action === 'update' && dedupResult.matchedEntry) {
        const deleted = await deleteMemory(
          dedupResult.matchedEntry.category,
          dedupResult.matchedEntry.date,
          dedupResult.matchedEntry.content
        );
        if (!deleted) {
          // Guard: if the old entry can't be removed, abort rather than create a duplicate
          throw new Error(
            `Could not remove existing entry for update: "${dedupResult.matchedEntry.content}"`
          );
        }
      }

      // Step 2: Category limit check (respects user-configured limits)
      const categoryEntries = await readCategoryMemories(category);
      const limit = getEffectiveLimit(category);

      if (categoryEntries.length >= limit) {
        const weakest = findWeakest(categoryEntries, 1);
        if (weakest.length > 0) {
          const victim = weakest[0].entry;
          const evicted = await deleteMemory(victim.category, victim.date, victim.content);
          if (!evicted) {
            // Non-fatal: log but continue — one extra entry is acceptable
            console.warn(
              `[hacklm-memory] Could not evict low-priority entry: "${victim.content}"`
            );
          }
        }
      }

      // Step 3: Store
      await appendMemory(category, content);

      // Step 4: Auto-cleanup counter
      await this.tickCleanupCounter();

      const actionVerb = dedupResult.action === 'update' ? 'Updated' : 'Stored';
      const updateNote =
        dedupResult.action === 'update'
          ? ` (replaced: "${dedupResult.matchedEntry?.content}")`
          : '';

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `${actionVerb} in ${CATEGORY_FILES[category]}: "${content}"${updateNote}`
        ),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Failed to store memory: ${message}`),
      ]);
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
      import('./cleanupMemory').then(m => m.runCleanup(false)).catch(err => {
        // Errors here are non-fatal but should be visible in the Extension Host log
        console.error('[hacklm-memory] Auto-cleanup failed:', err instanceof Error ? err.message : String(err));
      });
    }
  }
}
