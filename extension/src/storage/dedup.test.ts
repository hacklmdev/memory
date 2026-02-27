import { describe, it, expect } from 'vitest';
import { extractKeywords, checkDuplicate } from './dedup';

// ---- extractKeywords --------------------------------------------------------

describe('extractKeywords', () => {
  it('returns lowercase tokens, strips punctuation', () => {
    const kw = extractKeywords('Use TypeScript strictly.');
    expect(kw.has('typescript')).toBe(true);
    expect(kw.has('strictly')).toBe(true);
  });

  it('removes stop words', () => {
    const kw = extractKeywords('Use a lock before writing');
    expect(kw.has('a')).toBe(false);
    expect(kw.has('before')).toBe(false);
    expect(kw.has('lock')).toBe(true);
  });

  it('removes tokens shorter than 3 chars', () => {
    const kw = extractKeywords('do it');
    expect(kw.size).toBe(0);
  });

  it('returns empty set for an empty string', () => {
    expect(extractKeywords('').size).toBe(0);
  });
});

// ---- checkDuplicate ---------------------------------------------------------

const makeEntry = (content: string, category = 'Decision') => ({
  content,
  category,
  lineNumber: 1,
  file: '.memory/decisions.md',
});

describe('checkDuplicate', () => {
  it('returns skip for exact content match', () => {
    const entry = makeEntry('Use mutex before every file write');
    const result = checkDuplicate('Use mutex before every file write', [entry]);
    expect(result.action).toBe('skip');
    expect(result.similarity).toBe(1.0);
  });

  it('returns skip when similarity exceeds SKIP_THRESHOLD (0.8)', () => {
    // Near-identical sentence — high Jaccard
    const entry = makeEntry('Always use a mutex lock before writing to any file');
    const result = checkDuplicate('Always use mutex lock before writing file', [entry]);
    expect(result.action).toBe('skip');
    expect(result.similarity).toBeGreaterThanOrEqual(0.8);
  });

  it('returns store when similarity is below UPDATE_THRESHOLD (0.6)', () => {
    const entry = makeEntry('Use Redux for global state');
    const result = checkDuplicate('Prefer functional components in React', [entry]);
    expect(result.action).toBe('store');
    expect(result.similarity).toBeLessThan(0.6);
  });

  it('returns update when similarity is between thresholds (0.6 – 0.8)', () => {
    // Keywords: {typescript, strict, mode, webpack, bundler}
    // New:      {typescript, strict, mode, rollup,  bundler}
    // Intersection=4, Union=6, Jaccard≈0.667 → hits UPDATE_THRESHOLD
    const entry = makeEntry('typescript strict mode webpack bundler');
    const result = checkDuplicate('typescript strict mode rollup bundler', [entry]);
    expect(result.action).toBe('update');
    expect(result.similarity).toBeGreaterThanOrEqual(0.6);
    expect(result.similarity).toBeLessThan(0.8);
  });

  it('returns store with similarity 0 when no entries exist', () => {
    const result = checkDuplicate('something new', []);
    expect(result.action).toBe('store');
    expect(result.similarity).toBe(0);
  });

  it('ignores entries from a different category when category filter is set', () => {
    const entry = makeEntry('Use mutex before every file write', 'Quirk');
    const result = checkDuplicate('Use mutex before every file write', [entry], 'Decision');
    // Same text but different category — should not match
    expect(result.action).toBe('store');
  });

  it('two empty-keyword strings both score 0 similarity — not identical', () => {
    const entry = makeEntry('do it');
    const result = checkDuplicate('do it', [entry]);
    // Normalized text is identical → exact match → skip
    expect(result.action).toBe('skip');
  });
});
