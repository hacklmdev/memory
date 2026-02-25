import { type MemoryEntry } from './markdownStore';
import { daysBetween } from '../utils';

export function searchMemories(
  entries: MemoryEntry[],
  query: string,
  options: { limit?: number; category?: string } = {}
): MemoryEntry[] {
  const { limit = 10, category } = options;

  const queryLower = query.toLowerCase();
  const keywords = queryLower
    .split(/\s+/)
    .filter(w => w.length > 2)
    .map(w => w.replace(/[^a-z0-9]/g, ''));

  if (keywords.length === 0) {
    return entries
      .filter(e => !category || e.category === category)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  }

  const scored = entries
    .filter(e => !category || e.category === category)
    .map(entry => {
      const contentLower = entry.content.toLowerCase();
      let score = 0;

      for (const kw of keywords) {
        if (contentLower.includes(kw)) { score += 10; }
      }

      if (contentLower.includes(queryLower)) { score += 25; }

      const daysSince = daysBetween(entry.date, todayStr());
      if (daysSince <= 1) { score += 15; }
      else if (daysSince <= 7) { score += 12; }
      else if (daysSince <= 14) { score += 8; }
      else if (daysSince <= 30) { score += 4; }
      else { score += 1; } // baseline ensures entries older than 30 days remain findable

      return { entry, score };
    })
    .filter(s => s.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) { return b.score - a.score; }
    return b.entry.date.localeCompare(a.entry.date);
  });

  return scored.slice(0, limit).map(s => s.entry);
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}
