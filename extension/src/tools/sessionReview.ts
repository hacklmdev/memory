import * as vscode from 'vscode';
import { readAllMemories, upsertMemory, appendMemory, CATEGORY_FILES, type MemoryEntry } from '../storage/markdownStore';
import { resolveModel, sendLmRequest } from '../lm';

const GAP_COUNTER_KEY = 'hacklm-memory.gapCounter';
const GAP_ANALYSIS_INTERVAL = 3;
const MIN_ENTRIES_FOR_ANALYSIS = 5;
const MAX_SUGGESTIONS = 4;

const VALID_CATEGORIES = new Set(Object.keys(CATEGORY_FILES));

interface GapSuggestion {
  category: string;
  slug: string;
  content: string;
}

// ── Rate-limited trigger (called after each successful store) ─────────────────

export async function triggerGapAnalysis(
  justStored: { category: string; content: string; slug?: string },
  allEntries: MemoryEntry[],
  context: vscode.ExtensionContext
): Promise<void> {
  if (allEntries.length < MIN_ENTRIES_FOR_ANALYSIS) { return; }

  const count = (context.globalState.get<number>(GAP_COUNTER_KEY) ?? 0) + 1;
  await context.globalState.update(GAP_COUNTER_KEY, count);
  if (count < GAP_ANALYSIS_INTERVAL) { return; }
  await context.globalState.update(GAP_COUNTER_KEY, 0);

  const suggestions = await runGapAnalysis(justStored, allEntries);
  if (suggestions.length === 0) { return; }

  const autoApprove = vscode.workspace
    .getConfiguration('hacklm-memory')
    .get<boolean>('autoApproveStore', false);

  if (autoApprove) {
    await storeSuggestions(suggestions);
  } else {
    await promptUserForSuggestions(suggestions);
  }
}

// ── Manual full-session review ────────────────────────────────────────────────

export async function runSessionReview(): Promise<void> {
  const allEntries = await readAllMemories();
  if (allEntries.length < MIN_ENTRIES_FOR_ANALYSIS) {
    vscode.window.showInformationMessage('Not enough memories yet for a gap analysis (need at least 5).');
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Analysing memory gaps…', cancellable: false },
    async () => {
      const suggestions = await runGapAnalysis(null, allEntries);
      if (suggestions.length === 0) {
        vscode.window.showInformationMessage('No memory gaps found — everything looks covered.');
        return;
      }
      await promptUserForSuggestions(suggestions);
    }
  );
}

// ── Core LM call ──────────────────────────────────────────────────────────────

async function runGapAnalysis(
  justStored: { category: string; content: string; slug?: string } | null,
  allEntries: MemoryEntry[]
): Promise<GapSuggestion[]> {
  const model = await resolveModel();
  if (!model) { return []; }

  const existing = allEntries
    .map(e => `[${e.category}] ${e.slug ? `[${e.slug}] ` : ''}${e.content}`)
    .join('\n');

  const recentSection = justStored
    ? `\nRecently stored:\n[${justStored.category}] ${justStored.content}\n`
    : '';

  const prompt = [
    'You are reviewing a VS Code project memory store for gaps.',
    recentSection,
    'All current memories:',
    existing,
    '',
    `Identify up to ${MAX_SUGGESTIONS} decisions, conventions, or patterns clearly implied by the above but not yet captured.`,
    'Each suggestion must be durable (matters next week), specific (one clear rule), and not already covered.',
    'Never suggest entries that describe past events, completed tasks, or changelog notes.',
    'Content must be plain text only. No brackets, slug references, or cross-references in the content field.',
    '',

    'Reply with one line per suggestion in this exact format:',
    'SUGGESTION:[Category]:[kebab-slug]:[content]',
    '',
    `Valid categories: ${[...VALID_CATEGORIES].join(', ')}`,
    '',
    'If nothing is missing, reply with exactly: NONE',
  ].join('\n');

  const result = await sendLmRequest(
    model,
    [vscode.LanguageModelChatMessage.User(prompt)],
    { justification: 'Identifying decisions and patterns not yet captured in project memory.' }
  );

  if (!result) { return []; }
  return parseSuggestions(result);
}

// ── Response parser ───────────────────────────────────────────────────────────

function parseSuggestions(raw: string): GapSuggestion[] {
  const suggestions: GapSuggestion[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('SUGGESTION:')) { continue; }
    const parts = trimmed.slice('SUGGESTION:'.length).split(':');
    if (parts.length < 3) { continue; }
    const [category, slug, ...rest] = parts;
    const content = rest.join(':').trim();
    if (!category || !slug || !content) { continue; }
    if (!VALID_CATEGORIES.has(category.trim())) { continue; }
    suggestions.push({ category: category.trim(), slug: slug.trim(), content });
  }
  return suggestions.slice(0, MAX_SUGGESTIONS);
}

// ── UI ────────────────────────────────────────────────────────────────────────

async function promptUserForSuggestions(suggestions: GapSuggestion[]): Promise<void> {
  const items = suggestions.map(s => ({
    label: `[${s.category}]`,
    description: s.content,
    detail: `slug: ${s.slug}`,
    picked: true,
    suggestion: s,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: `Memory gaps found — select entries to store (${suggestions.length} suggested)`,
    matchOnDescription: true,
  });

  if (!selected || selected.length === 0) { return; }
  await storeSuggestions(selected.map(i => i.suggestion));
  vscode.window.showInformationMessage(`Stored ${selected.length} memory ${selected.length === 1 ? 'entry' : 'entries'}.`);
}

async function storeSuggestions(suggestions: GapSuggestion[]): Promise<void> {
  for (const s of suggestions) {
    try {
      if (s.slug) {
        await upsertMemory(s.category, s.slug, s.content);
      } else {
        await appendMemory(s.category, s.content);
      }
    } catch {
      // Non-fatal — skip failed entries
    }
  }
}
