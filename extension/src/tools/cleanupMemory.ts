import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  readAllMemories,
  readCategoryMemories,
  deleteMemory,
  appendMemory,
  getMemoryDir,
  CATEGORY_FILES,
} from '../storage/markdownStore';
import { findSimilarClusters, extractKeywords } from '../storage/dedup';
import { scoreAllEntries } from '../storage/scoring';
import { getEffectiveLimit } from '../utils';

/**
 * Run the full cleanup pipeline.
 *
 * Steps:
 *   1. Find clusters of similar memories → merge
 *   2. Score all entries → prune lowest-scoring excess per category
 *   3. Write cleanup log
 *
 * @param dryRun  If true, compute changes but do not write anything.
 * @returns       Human-readable report string.
 */
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
  const entryKey = (e: { category: string; date: string; content: string }) =>
    `${e.category}\0${e.date}\0${e.content}`;

  // ─── Step 1: Merge duplicates ───
  const clusters = findSimilarClusters(allEntries, 0.5);

  for (const cluster of clusters) {
    if (cluster.length < 2) { continue; }

    const sorted = [...cluster].sort((a, b) => {
      const dateDiff = b.date.localeCompare(a.date);
      if (dateDiff !== 0) { return dateDiff; }
      return a.content.length - b.content.length;
    });

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
        await deleteMemory(loser.category, loser.date, loser.content);
      }
      if (mergedContent !== winner.content) {
        await deleteMemory(winner.category, winner.date, winner.content);
        // Preserve the original date so the winner is not re-stamped as today
        await appendMemory(winner.category, mergedContent, winner.date);
      }
    } else {
      for (const loser of losers) {
        virtuallyDeleted.add(entryKey(loser));
      }
      if (mergedContent !== winner.content) {
        virtuallyDeleted.add(entryKey(winner));
      }
    }

    mergedCount += losers.length;
    actions.push(`Merged ${cluster.length} similar entries → "${mergedContent.substring(0, 60)}…"`);
  }

  // ─── Step 2: Prune over-limit categories (respects user-configured limits) ───
  for (const category of Object.keys(CATEGORY_FILES)) {
    const limit = getEffectiveLimit(category);
    const raw = await readCategoryMemories(category);
    // In dry-run mode, exclude entries that would already be gone after merges
    const categoryEntries = dryRun
      ? raw.filter(e => !virtuallyDeleted.has(entryKey(e)))
      : raw;
    if (categoryEntries.length <= limit) { continue; }

    const scored = scoreAllEntries(categoryEntries);
    const toRemove = scored.slice(limit); // lowest-scoring excess

    for (const item of toRemove) {
      if (!dryRun) {
        await deleteMemory(item.entry.category, item.entry.date, item.entry.content);
      }
      prunedCount++;
      actions.push(
        `Pruned [${category}] (score ${item.score}): "${item.entry.content.substring(0, 50)}…"`
      );
    }
  }

  // ─── Step 3: Write cleanup log ───
  if (!dryRun && actions.length > 0) {
    await writeCleanupLog(actions);
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
    ``,
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
