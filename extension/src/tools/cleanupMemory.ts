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
import { resolveModel, sendLmRequest } from '../lm';

const MAX_CONFLICTS_LOG_LINES = 50;
const MERGE_SIMILARITY_THRESHOLD = 0.3;
const MAX_MERGE_KEYWORDS = 3;

export async function runCleanup(): Promise<string> {
  const actions: string[] = [];

  // Normalize user-typed lines before reading entries — runs first so slug
  // assignment and dedup operate on already-clean data.
  await normalizeRawLines(actions);

  const allEntries = await readAllMemories();

  if (allEntries.length === 0) {
    return 'Memory is empty — nothing to clean up.';
  }

  let mergedCount = 0;
  let prunedCount = 0;

  await sanitizeEntryContent(allEntries, actions);
  await pruneStaleEntries(allEntries, actions);

  const clusters = findSimilarClusters(allEntries, MERGE_SIMILARITY_THRESHOLD);

  for (const cluster of clusters) {
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
    if (extraInfo.length > 0 && extraInfo.length <= MAX_MERGE_KEYWORDS) {
      mergedContent = `${winner.content} (also: ${extraInfo.join(', ')})`;
    }

    for (const loser of losers) {
      await deleteMemory(loser.category, loser.content, loser.slug);
    }
    if (mergedContent !== winner.content) {
      await deleteMemory(winner.category, winner.content, winner.slug);
      await appendMemory(winner.category, mergedContent);
    }

    mergedCount += losers.length;
    actions.push(`Merged ${cluster.length} similar entries → "${mergedContent.substring(0, 60)}…"`);
  }

  for (const category of Object.keys(CATEGORY_FILES)) {
    const limit = getEffectiveLimit(category);
    const categoryEntries = await readCategoryMemories(category);
    if (categoryEntries.length <= limit) { continue; }

    const scored = scoreAllEntries(categoryEntries);
    const toRemove = scored.slice(limit);

    for (const item of toRemove) {
      await deleteMemory(item.entry.category, item.entry.content, item.entry.slug);
      prunedCount++;
      actions.push(
        `Pruned [${category}] (score ${item.score}): "${item.entry.content.substring(0, 50)}…"`
      );
    }
  }

  await migrateFiles();
  await slugAssignUntagged();
  await pruneConflictsLog();

  if (actions.length > 0) {
    await writeCleanupLog(actions);
  }

  const finalEntries = await readAllMemories();

  if (actions.length === 0) {
    const populatedCategories = new Set(allEntries.map(e => e.category)).size;
    return `Memory is already clean! ${allEntries.length} entries across ${populatedCategories} categories.`;
  }

  return [
    `Cleanup Report`,
    ``,
    `Before: ${allEntries.length} entries`,
    `After:  ${finalEntries.length} entries`,

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

/**
 * Convert user-typed freeform lines into proper bullet entries.
 * Handles: plain text, asterisk bullets, slugless dashes.
 * Skips: blank lines, # headers, existing `- ` bullets, file boilerplate.
 */
async function normalizeRawLines(actions: string[]): Promise<void> {
  const memDir = getMemoryDir();
  for (const [, filename] of Object.entries(CATEGORY_FILES)) {
    const filePath = path.join(memDir, filename);
    try {
      const text = await fs.readFile(filePath, 'utf-8');
      const lines = text.split('\n');
      let changed = false;

      const normalized = lines.map(line => {
        const trimmed = line.trim();
        if (
          trimmed === '' ||
          trimmed.startsWith('#') ||
          trimmed.startsWith('- ') ||
          /^Memories stored by/i.test(trimmed)
        ) { return line; }

        // Asterisk bullet → dash bullet
        if (/^\*\s+/.test(trimmed)) {
          changed = true;
          return `- ${trimmed.replace(/^\*\s+/, '').trim()}`;
        }

        // Plain text → bullet (slugAssignUntagged will add a slug on next pass)
        changed = true;
        return `- ${trimmed}`;
      });

      if (changed) {
        await fs.writeFile(filePath, normalized.join('\n'), 'utf-8');
        actions.push(`Normalized raw lines in ${filename}`);
      }
    } catch {
      // file missing — skip
    }
  }
}

/** Strip [[double-bracket]] artifacts that the LM occasionally injects into content. */
async function sanitizeEntryContent(entries: MemoryEntry[], actions: string[]): Promise<void> {
  const DOUBLE_BRACKET = /\[\[[^\]]+\]\]\s*/g;
  for (const entry of entries) {
    if (!DOUBLE_BRACKET.test(entry.content)) { continue; }
    DOUBLE_BRACKET.lastIndex = 0;
    const cleaned = entry.content.replace(DOUBLE_BRACKET, '').trim();
    if (!cleaned || cleaned === entry.content) { continue; }
    const deleted = await deleteMemory(entry.category, entry.content, entry.slug);
    if (deleted) {
      if (entry.slug) {
        await upsertMemory(entry.category, entry.slug, cleaned);
      } else {
        await appendMemory(entry.category, cleaned);
      }
      actions.push(`Sanitized [${entry.slug ?? entry.category}]: removed double-bracket artifact`);
    }
  }
}

/** Remove known stale status/changelog slugs left by older builds. */
async function pruneStaleEntries(entries: MemoryEntry[], actions: string[]): Promise<void> {
  const STALE_SLUGS = new Set(['last-cleanup', 'last-session-debrief']);
  for (const entry of entries) {
    if (!entry.slug || !STALE_SLUGS.has(entry.slug)) { continue; }
    const deleted = await deleteMemory(entry.category, entry.content, entry.slug);
    if (deleted) {
      actions.push(`Removed stale entry [${entry.slug}]`);
    }
  }
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
    const model = await resolveModel();
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
    const result = await sendLmRequest(model, messages, {
      justification: 'Assigning short topic slugs to untagged memory entries.',
    });
    if (!result) { return null; }


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
