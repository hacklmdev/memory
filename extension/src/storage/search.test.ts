import { describe, it, expect } from 'vitest';
import { searchMemories } from './search';

const makeEntry = (content: string, category = 'Decision') => ({
  content,
  category,
  lineNumber: 1,
  file: `.memory/${category.toLowerCase()}s.md`,
});

const ENTRIES = [
  makeEntry('Use a mutex lock before every file write', 'Quirk'),
  makeEntry('All LM calls go through lm.ts only', 'Decision'),
  makeEntry('Use zod for all runtime validation', 'Decision'),
  makeEntry('Never expose API keys in source code', 'Security'),
  makeEntry('Prefer short functions under 30 lines', 'Preference'),
];

// ---- basic search -----------------------------------------------------------

describe('searchMemories', () => {
  it('returns entries matching a keyword', () => {
    const results = searchMemories(ENTRIES, 'mutex');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('mutex');
  });

  it('exact phrase match scores higher than keyword-only match', () => {
    const results = searchMemories(ENTRIES, 'lm calls');
    // "All LM calls go through lm.ts only" contains the exact phrase
    expect(results[0].content.toLowerCase()).toContain('lm calls');
  });

  it('returns empty array when no entries match', () => {
    const results = searchMemories(ENTRIES, 'postgresql');
    expect(results).toEqual([]);
  });

  it('filters by category when option is provided', () => {
    const results = searchMemories(ENTRIES, 'all', { category: 'Decision' });
    expect(results.every(r => r.category === 'Decision')).toBe(true);
  });

  it('respects the limit option', () => {
    // "all" appears in multiple entries
    const results = searchMemories(ENTRIES, 'all', { limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('returns up to limit entries from all when query is empty', () => {
    const results = searchMemories(ENTRIES, '', { limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('returns empty array for empty entries list', () => {
    const results = searchMemories([], 'mutex');
    expect(results).toEqual([]);
  });

  it('multi-keyword query boosts entries with more matches', () => {
    const results = searchMemories(ENTRIES, 'lm calls through');
    // All keywords present in "All LM calls go through lm.ts only"
    expect(results[0].content.toLowerCase()).toContain('lm');
  });
});
