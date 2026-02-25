import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  readAllMemories,
  readCategoryMemories,
  deleteMemory,
  appendMemory,
  upsertMemory,
  getMemoryDir,
  CATEGORY_FILES,
  type MemoryEntry,
} from '../storage/markdownStore';
import { findSimilarClusters, extractKeywords } from '../storage/dedup';
import { scoreAllEntries } from '../storage/scoring';
import { getEffectiveLimit } from '../utils';

const MAX_CONFLICTS_LOG_LINES = 50;

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

  if (!dryRun) {
    await consolidateDateGroups();
    await slugAssignUntagged();
    await pruneConflictsLog();
  }

  if (!dryRun && actions.length > 0) {
    await writeCleanupLog(actions);
    await writeCleanupDebrief(mergedCount, prunedCount);
  }

  const prefix = dryRun ? 'DRY RUN — no changes made\n\n' : '';
  const finalEntries = dryRun ? allEntries : await readAllMemories();
  const consolidatedNote = dryRun ? '' : 'Consolidated same-date headers.\n';

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
    consolidatedNote,
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

// Appended directly (not via StoreMemoryTool) to avoid triggering the auto-cleanup counter.
async function writeCleanupDebrief(mergedCount: number, prunedCount: number): Promise<void> {
  const parts: string[] = [];
  if (mergedCount > 0) { parts.push(`merged ${mergedCount} duplicate(s)`); }
  if (prunedCount > 0) { parts.push(`pruned ${prunedCount} low-scoring entr${prunedCount === 1 ? 'y' : 'ies'}`); }
  if (parts.length === 0) { return; }
  await appendMemory('Quirk', `Last cleanup: ${parts.join(', ')}`).catch(() => {});
}

/**
 * Merge multiple `## YYYY-MM-DD` headers with the same date into one block per file.
 */
async function consolidateDateGroups(): Promise<void> {
  const memDir = getMemoryDir();
  for (const filename of Object.values(CATEGORY_FILES)) {
    const filePath = path.join(memDir, filename);
    try {
      const text = await fs.readFile(filePath, 'utf-8');
      const consolidated = consolidateText(text);
      if (consolidated !== text) {
        await fs.writeFile(filePath, consolidated, 'utf-8');
      }
    } catch {
      // File doesn't exist or can't be read — skip
    }
  }
}

function consolidateText(text: string): string {
  const lines = text.split('\n');
  const header: string[] = [];
  const dateGroups = new Map<string, string[]>();
  const dateOrder: string[] = [];
  let currentDate = '';
  let inHeader = true;

  for (const line of lines) {
    const dateMatch = line.match(/^## (\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      inHeader = false;
      currentDate = dateMatch[1];
      if (!dateGroups.has(currentDate)) {
        dateGroups.set(currentDate, []);
        dateOrder.push(currentDate);
      }
      continue;
    }

    if (inHeader) {
      header.push(line);
      continue;
    }

    if (currentDate && line.trim().length > 0) {
      dateGroups.get(currentDate)!.push(line);
    }
  }

  const result = [...header];
  for (const date of dateOrder) {
    const entries = dateGroups.get(date)!;
    if (entries.length === 0) { continue; }
    result.push('', `## ${date}`);
    result.push(...entries);
  }
  result.push('');

  return result.join('\n');
}

/**
 * Assign slugs to untagged entries via a single batched LLM call.
 */
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

      // Delete the old untagged entry and re-insert with slug
      const deleted = await deleteMemory(entry.category, entry.date, entry.content);
      if (deleted) {
        await upsertMemory(entry.category, slug, entry.content, entry.date);
      }
    }
  } catch {
    // Non-fatal — slugs will be assigned on the next cleanup
  }
}

async function llmAssignSlugs(entries: MemoryEntry[]): Promise<string[] | null> {
  try {
    const models = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
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

/**
 * Keep only the last MAX_CONFLICTS_LOG_LINES lines in conflicts.log.
 */
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
