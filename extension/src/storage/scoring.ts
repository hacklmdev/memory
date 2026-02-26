import { type MemoryEntry } from './markdownStore';

const CATEGORY_WEIGHT: Record<string, number> = {
  'Security': 25,
  'Instruction': 20,
  'Decision': 15,
  'Quirk': 10,
  'Preference': 10,
};

const MAX_SPECIFICITY_SCORE = 15;

export interface ScoredEntry {
  entry: MemoryEntry;
  score: number;
}

export function scoreEntry(entry: MemoryEntry): ScoredEntry {
  const categoryScore = CATEGORY_WEIGHT[entry.category] ?? 10;

  const charCount = entry.content.length;
  let brevityScore: number;
  if (charCount <= 50) { brevityScore = 15; }
  else if (charCount <= 100) { brevityScore = 12; }
  else if (charCount <= 150) { brevityScore = 8; }
  else if (charCount <= 200) { brevityScore = 5; }
  else { brevityScore = 2; }

  const specificityScore = measureSpecificity(entry.content);
  const totalScore = categoryScore + brevityScore + specificityScore;

  return {
    entry,
    score: totalScore,
  };
}

export function scoreAllEntries(entries: MemoryEntry[]): ScoredEntry[] {
  return entries.map(e => scoreEntry(e)).sort((a, b) => b.score - a.score);
}

export function findWeakest(entries: MemoryEntry[], count = 3): ScoredEntry[] {
  // Caller already filters to the desired category; no need to re-filter here
  return scoreAllEntries(entries).slice(-count);
}

function measureSpecificity(text: string): number {
  let score = 0;
  if (/\.\w{1,5}($|\s|\/)|\/\w+/i.test(text)) { score += 4; }
  if (/\b(npm|pnpm|yarn|git|docker|make|cargo|pip|go)\b/i.test(text)) { score += 3; }
  if (/["'`]/.test(text)) { score += 2; }
  if (/\d+\.\d+/.test(text)) { score += 2; }
  if (/\b[A-Z_]{3,}\b/.test(text)) { score += 2; }
  if (/[a-z][A-Z]/.test(text)) { score += 2; }
  return Math.min(score, MAX_SPECIFICITY_SCORE);
}
