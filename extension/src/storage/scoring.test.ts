import { describe, it, expect } from 'vitest';
import { scoreEntry, scoreAllEntries, findWeakest } from './scoring';

const makeEntry = (content: string, category = 'Decision') => ({
  content,
  category,
  lineNumber: 1,
  file: '.memory/decisions.md',
});

// ---- scoreEntry -------------------------------------------------------------

describe('scoreEntry', () => {
  it('higher-weight categories score higher for identical content', () => {
    const security = scoreEntry(makeEntry('lock the mutex', 'Security'));
    const preference = scoreEntry(makeEntry('lock the mutex', 'Preference'));
    expect(security.score).toBeGreaterThan(preference.score);
  });

  it('shorter content earns a higher brevity score', () => {
    const short = scoreEntry(makeEntry('Use a lock.'));                     // ≤50 chars
    const long = scoreEntry(makeEntry('A'.repeat(201), 'Decision'));        // >200 chars
    expect(short.score).toBeGreaterThan(long.score);
  });

  it('specificity bonus applied for file paths', () => {
    const with_path = scoreEntry(makeEntry('Edit src/extension.ts to add the command'));
    const plain = scoreEntry(makeEntry('Edit the extension file to add the command'));
    // src/extension.ts should trigger the path regex
    expect(with_path.score).toBeGreaterThanOrEqual(plain.score);
  });

  it('specificity bonus applied for camelCase identifiers', () => {
    const with_camel = scoreEntry(makeEntry('Call resolveModel before sendRequest'));
    const plain = scoreEntry(makeEntry('Call the resolver before sending the request'));
    expect(with_camel.score).toBeGreaterThanOrEqual(plain.score);
  });

  it('score is always a positive number', () => {
    const result = scoreEntry(makeEntry(''));
    expect(result.score).toBeGreaterThan(0);
  });

  it('returns the original entry unchanged', () => {
    const entry = makeEntry('Use strict mode');
    expect(scoreEntry(entry).entry).toBe(entry);
  });
});

// ---- scoreAllEntries --------------------------------------------------------

describe('scoreAllEntries', () => {
  it('returns entries sorted descending by score', () => {
    const entries = [
      makeEntry('A'.repeat(201)),                    // very long → low brevity
      makeEntry('Short.', 'Security'),               // short + high category weight
      makeEntry('Medium length entry here ok.'),
    ];
    const scored = scoreAllEntries(entries);
    for (let i = 0; i < scored.length - 1; i++) {
      expect(scored[i].score).toBeGreaterThanOrEqual(scored[i + 1].score);
    }
  });

  it('handles empty array', () => {
    expect(scoreAllEntries([])).toEqual([]);
  });
});

// ---- findWeakest ------------------------------------------------------------

describe('findWeakest', () => {
  it('returns the lowest-scoring entries', () => {
    const entries = [
      makeEntry('Short Security rule.', 'Security'),
      makeEntry('A'.repeat(210)),   // long, low score
      makeEntry('Medium entry here.', 'Decision'),
    ];
    const weakest = findWeakest(entries, 1);
    expect(weakest).toHaveLength(1);
    // The long entry should score lowest
    expect(weakest[0].entry.content).toBe('A'.repeat(210));
  });

  it('returns all entries when count >= length', () => {
    const entries = [makeEntry('a'), makeEntry('b')];
    expect(findWeakest(entries, 5)).toHaveLength(2);
  });

  it('handles empty array', () => {
    expect(findWeakest([], 3)).toEqual([]);
  });
});
