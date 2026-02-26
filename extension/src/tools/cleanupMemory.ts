import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  readAllMemories,
  readCategoryMemories,
  deleteMemory,
  appendMemory,
  upsertMemory,
  migrateFiles,
  getMemoryDir,
  CATEGORY_FILES,
  type MemoryEntry,
} from '../storage/markdownStore';
import { findSimilarClusters, extractKeywords } from '../storage/dedup';
import { scoreAllEntries } from '../storage/scoring';
import { getEffectiveLimit } from '../utils';

const MAX_CONFLICTS_LOG_LINES = 50;

export async function runCleanup(dryRun: boolean): Promise<string> {
  const allEntries = await readAllMemories();

  if (allEntries.length === 0) {
    return 'Memory is empty — nothing to clean up.';
  }

  const actions: string[] = [];
  let mergedCount = 0;
  let prunedCount = 0;

  /**
   * Keys of entries that would be deleted in a dry run.
   * Used to give the prune step an accurate post-merge view of each
   * category without actually writing to disk.
   */
  const virtuallyDeleted = new Set<string>();
  const entryKey = (e: { category: string; content: string }) =>
    `${e.category}\0${e.content}`;

  const clusters = findSimilarClusters(allEntries, 0.5);

  for (const cluster of clusters) {
    if (cluster.length < 2) { continue; }

    const sorted = [...cluster].sort((a, b) => a.content.length - b.content.length);

    const winner = sorted[0];
    const losers = sorted.slice(1);

    const winnerKeywords = extractKeywords(winner.content);
    const extraInfo: string[] = [];

    for (const loser of losers) {
      const loserKeywords = extractKeywords(loser.content);
      for (const kw of loserKeywords) {
        if (!winnerKeywords.has(kw) && kw.length > 3) {
          extraInfo.push(kw);
        }
      }
    }

    let mergedContent = winner.content;
    if (extraInfo.length > 0 && extraInfo.length <= 3) {
      mergedContent = `${winner.content} (also: ${extraInfo.join(', ')})`;
    }

    if (!dryRun) {
      for (const loser of losers) {
        await deleteMemory(loser.category, loser.content, loser.slug);
      }
      if (mergedContent !== winner.content) {
        await deleteMemory(winner.category, winner.content, winner.slug);
        await appendMemory(winner.category, mergedContent);
      }
    } else {
      // Only losers are truly removed; the winner survives (possibly with updated
      // content) so it must NOT be placed in virtuallyDeleted — doing so would
      // make the prune step see one fewer entry than will really exist, causing
      // it to miss prune candidates that the real run would catch.
      for (const loser of losers) {
        virtuallyDeleted.add(entryKey(loser));
      }
    }

    mergedCount += losers.length;
    actions.push(`Merged ${cluster.length} similar entries → "${mergedContent.substring(0, 60)}…"`);
  }

  for (const category of Object.keys(CATEGORY_FILES)) {
    const limit = getEffectiveLimit(category);
    const raw = await readCategoryMemories(category);
    // In dry-run mode, exclude entries that would already be gone after merges
    const categoryEntries = dryRun
      ? raw.filter(e => !virtuallyDeleted.has(entryKey(e)))
      : raw;
    if (categoryEntries.length <= limit) { continue; }

    const scored = scoreAllEntries(categoryEntries);
    const toRemove = scored.slice(limit);

    for (const item of toRemove) {
      if (!dryRun) {
        await deleteMemory(item.entry.category, item.entry.content, item.entry.slug);
      }
      prunedCount++;
      actions.push(
        `Pruned [${category}] (score ${item.score}): "${item.entry.content.substring(0, 50)}…"`
      );
    }
  }

  if (!dryRun) {
    await migrateFiles();
    await slugAssignUntagged();
    await pruneConflictsLog();
  }

  if (!dryRun && actions.length > 0) {
    await writeCleanupLog(actions);
    await writeCleanupDebrief(mergedCount, prunedCount);
  }

  const prefix = dryRun ? 'DRY RUN — no changes made\n\n' : '';
  const finalEntries = dryRun ? allEntries : await readAllMemories();

  if (actions.length === 0) {
    return `${prefix}Memory is already clean! ${allEntries.length} entries across ${Object.keys(CATEGORY_FILES).length} categories.`;
  }

  return [
    `${prefix}Cleanup Report`,
    ``,
    `Before: ${allEntries.length} entries`,
    `After:  ${dryRun ? allEntries.length - mergedCount - prunedCount : finalEntries.length} entries`,
    `Merged: ${mergedCount} duplicates`,
    `Pruned: ${prunedCount} low-scoring`,
    `Actions:`,
    ...actions,
  ].join('\n');
}

async function writeCleanupLog(actions: string[]): Promise<void> {
  try {
    const logPath = path.join(getMemoryDir(), 'cleanup.log');
    const timestamp = new Date().toISOString();
    const entry = `\n--- Cleanup: ${timestamp} ---\n${actions.join('\n')}\n`;
    await fs.appendFile(logPath, entry, 'utf-8');
  } catch {
    // Non-fatal — cleanup still succeeded
  }
}

// Upserted directly to avoid triggering the auto-cleanup counter; fixed slug prevents duplicates.
async function writeCleanupDebrief(mergedCount: number, prunedCount: number): Promise<void> {
  const parts: string[] = [];
  if (mergedCount > 0) { parts.push(`merged ${mergedCount} duplicate(s)`); }
  if (prunedCount > 0) { parts.push(`pruned ${prunedCount} low-scoring entr${prunedCount === 1 ? 'y' : 'ies'}`); }
  if (parts.length === 0) { return; }
  await upsertMemory('Quirk', 'last-cleanup', `Last cleanup: ${parts.join(', ')}`).catch(() => {});
}

async function slugAssignUntagged(): Promise<void> {
  try {
    const allEntries = await readAllMemories();
    const untagged = allEntries.filter(e => !e.slug);
    if (untagged.length === 0) { return; }

    const slugs = await llmAssignSlugs(untagged);
    if (slugs?.length !== untagged.length) { return; }

    for (let i = 0; i < untagged.length; i++) {
      const entry = untagged[i];
      const slug = slugs[i];
      if (!slug || slug.length === 0) { continue; }

      const deleted = await deleteMemory(entry.category, entry.content, entry.slug);
      if (deleted) {
        await upsertMemory(entry.category, slug, entry.content);
      }
    }
  } catch {
    // Non-fatal — slugs will be assigned on the next cleanup
  }
}

async function llmAssignSlugs(entries: MemoryEntry[]): Promise<string[] | null> {
  try {
    const family = vscode.workspace.getConfiguration('hacklm-memory').get<string>('lmFamily', 'gpt-5-mini');
    const models = await vscode.lm.selectChatModels({ family });
    const model = models[0];
    if (!model) { return null; }

    const entryList = entries
      .map((e, i) => `${i}: "${e.content}"`)
      .join('\n');

    const prompt = [
      'Assign a kebab-case topic slug (1-3 words) to each memory entry below.',
      'Reply as a JSON array of strings, one slug per entry, in the same order.',
      'Example: ["console-logs", "async-style", "comments"]',
      '',
      entryList,
    ].join('\n');

    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
    const response = await model.sendRequest(messages, {});

    let result = '';
    for await (const chunk of response.text) {
      result += chunk;
    }

    // Extract JSON array from response (may be wrapped in markdown code block)
    const jsonMatch = /\[[\s\S]*\]/.exec(result);
    if (!jsonMatch) { return null; }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed) || parsed.length !== entries.length) { return null; }
    if (!parsed.every((s: unknown) => typeof s === 'string')) { return null; }

    return parsed;
  } catch {
    return null;
  }
}

async function pruneConflictsLog(): Promise<void> {
  try {
    const logPath = path.join(getMemoryDir(), 'conflicts.log');
    const text = await fs.readFile(logPath, 'utf-8');
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length <= MAX_CONFLICTS_LOG_LINES) { return; }
    const pruned = lines.slice(-MAX_CONFLICTS_LOG_LINES).join('\n') + '\n';
    await fs.writeFile(logPath, pruned, 'utf-8');
  } catch {
    // File doesn't exist or is empty — nothing to prune
  }
}
