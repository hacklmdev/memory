import * as vscode from 'vscode';
import { readAllMemories } from '../storage/markdownStore';
import { searchMemories } from '../storage/search';

export interface QueryMemoryInput {
  query: string;
  category?: 'Instruction' | 'Quirk' | 'Preference' | 'Decision' | 'Security';
  limit?: number;
}

export class QueryMemoryTool implements vscode.LanguageModelTool<QueryMemoryInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<QueryMemoryInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const { query, category, limit } = options.input;

    try {
      const maxResults = Math.min(limit ?? 10, 20);
      // Always load all entries and pass the category filter into searchMemories.
      // This keeps a single, consistent filtering path and avoids double-filtering
      // that could silently mask regressions.
      const entries = await readAllMemories();

      const results = searchMemories(entries, query, { limit: maxResults, category });

      if (results.length === 0) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(`No memories found matching "${query}".`),
        ]);
      }

      const formatted = results
        .map(r => `[${r.category}] (${r.date}) ${r.content}`)
        .join('\n');

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Found ${results.length} memories:\n\n${formatted}`),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Query failed: ${message}`),
      ]);
    }
  }
}
