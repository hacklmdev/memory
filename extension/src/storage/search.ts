import { type MemoryEntry } from './markdownStore';

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
    .map(w => w.replaceAll(/[^a-z0-9]/g, ''));

  const filtered = entries.filter(e => !category || e.category === category);

  if (keywords.length === 0) {
    return filtered.slice(0, limit);
  }

  const scored = filtered
    .map(entry => {
      const contentLower = entry.content.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (contentLower.includes(kw)) { score += 10; }
      }
      if (contentLower.includes(queryLower)) { score += 25; }
      return { entry, score };
    })
    .filter(s => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.entry);
}
