import { type MemoryEntry } from './markdownStore';

/** Words too common to be meaningful */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too',
  'very', 'just', 'because', 'if', 'when', 'while', 'where', 'how',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'they',
  'them', 'their', 'use', 'used', 'using', 'always', 'never',
]);

const SKIP_THRESHOLD = 0.8;
const UPDATE_THRESHOLD = 0.6;

export interface DedupResult {
  similarity: number;
  matchedEntry?: MemoryEntry;
  action: 'store' | 'skip' | 'update';
}

export function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replaceAll(/[^a-z0-9\s-]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  // Both empty → no meaningful keywords in common; treat as distinct, not identical
  if (setA.size === 0 && setB.size === 0) { return 0; }
  if (setA.size === 0 || setB.size === 0) { return 0; }

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) { intersection++; }
  }

  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

export function checkDuplicate(
  newContent: string,
  existingEntries: MemoryEntry[],
  category?: string
): DedupResult {
  const newNorm = normalize(newContent);
  const newKeywords = extractKeywords(newContent);

  let bestSimilarity = 0;
  let bestMatch: MemoryEntry | undefined;

  for (const entry of existingEntries) {
    if (category && entry.category !== category) { continue; }

    const entryNorm = normalize(entry.content);

    if (newNorm === entryNorm) {
      return { similarity: 1, matchedEntry: entry, action: 'skip' };
    }

    const entryKeywords = extractKeywords(entry.content);
    const similarity = jaccardSimilarity(newKeywords, entryKeywords);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = entry;
    }
  }

  if (bestSimilarity >= SKIP_THRESHOLD) {
    return { similarity: bestSimilarity, matchedEntry: bestMatch, action: 'skip' };
  }

  if (bestSimilarity >= UPDATE_THRESHOLD) {
    return { similarity: bestSimilarity, matchedEntry: bestMatch, action: 'update' };
  }

  return { similarity: bestSimilarity, matchedEntry: bestMatch, action: 'store' };
}

export function findSimilarClusters(
  entries: MemoryEntry[],
  threshold = 0.5
): MemoryEntry[][] {
  const clusters: MemoryEntry[][] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < entries.length; i++) {
    if (assigned.has(i)) { continue; }

    const cluster: MemoryEntry[] = [entries[i]];
    assigned.add(i);

    for (let j = i + 1; j < entries.length; j++) {
      if (assigned.has(j)) { continue; }
      if (entries[j].category !== entries[i].category) { continue; }

      // Compare against ALL current cluster members (transitive / complete-linkage approach)
      // This prevents missing duplicates like A~B and B~C that are not directly A~C
      const jKeywords = extractKeywords(entries[j].content);
      const isClose = cluster.some(member => {
        const memberKeywords = extractKeywords(member.content);
        return jaccardSimilarity(jKeywords, memberKeywords) >= threshold;
      });

      if (isClose) {
        cluster.push(entries[j]);
        assigned.add(j);
      }
    }

    if (cluster.length > 1) {
      clusters.push(cluster);
    }
  }

  return clusters;
}
