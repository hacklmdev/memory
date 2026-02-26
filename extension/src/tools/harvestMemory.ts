import * as vscode from 'vscode';
import {
  readAllMemories,
  readCategoryMemories,
  appendMemory,
  upsertMemory,
  deleteMemory,
  CATEGORY_FILES,
} from '../storage/markdownStore';
import { checkDuplicate } from '../storage/dedup';
import { findWeakest } from '../storage/scoring';
import { getEffectiveLimit } from '../utils';

const STORE_TURN_KEY = 'hacklm-memory.lastStoreTurn';
const TURN_WINDOW_MS = 120_000;

export interface HarvestFinding {
  category: 'Instruction' | 'Quirk' | 'Preference' | 'Decision' | 'Security';
  content: string;
  slug?: string;
}

export interface HarvestMemoryInput {
  findings: HarvestFinding[];
}

export class HarvestMemoryTool implements vscode.LanguageModelTool<HarvestMemoryInput> {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<HarvestMemoryInput>,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Harvesting memories from this turn…' };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<HarvestMemoryInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    // Skip if storeMemory was already called explicitly this turn
    const lastStore = this.context.workspaceState.get<number>(STORE_TURN_KEY);
    if (lastStore !== undefined && Date.now() - lastStore < TURN_WINDOW_MS) {
      return this.textResult('storeMemory already called this turn — harvest skipped.');
    }

    const { findings } = options.input;
    if (!findings || findings.length === 0) {
      return this.textResult('No findings to harvest.');
    }

    let harvested = 0;
    let skipped = 0;

    try {
      // Read all entries once; refresh per-category lazily inside the loop
      const allEntries = await readAllMemories();

      for (const finding of findings) {
        const { category, content, slug } = finding;

        const dedupResult = checkDuplicate(content, allEntries, category);
        if (dedupResult.action === 'skip') {
          skipped++;
          continue;
        }

        // Remove the near-duplicate before writing the updated version
        if (dedupResult.action === 'update' && dedupResult.matchedEntry) {
          await deleteMemory(
            dedupResult.matchedEntry.category,
            dedupResult.matchedEntry.content,
            dedupResult.matchedEntry.slug
          );
        }

        // Enforce per-category capacity
        const categoryEntries = await readCategoryMemories(category);
        const limit = getEffectiveLimit(category);
        if (categoryEntries.length >= limit) {
          const weakest = findWeakest(categoryEntries, 1);
          if (weakest.length > 0) {
            const victim = weakest[0].entry;
            await deleteMemory(victim.category, victim.content, victim.slug);
          }
        }

        if (slug) {
          await upsertMemory(category, slug, content);
        } else {
          await appendMemory(category, content);
        }

        // Keep allEntries in sync so dedup works correctly for subsequent findings
        allEntries.push({ category, content, slug, file: CATEGORY_FILES[category], lineNumber: -1 });

        harvested++;
      }

      if (harvested === 0 && skipped === findings.length) {
        return this.textResult(`All ${skipped} finding(s) already in memory — nothing new harvested.`);
      }

      const parts: string[] = [];
      if (harvested > 0) { parts.push(`harvested ${harvested} finding(s)`); }
      if (skipped > 0) { parts.push(`skipped ${skipped} as duplicate(s)`); }
      return this.textResult(parts.join(', ') + '.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.textResult(`Harvest failed: ${message}`);
    }
  }

  private textResult(text: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(text),
    ]);
  }
}
