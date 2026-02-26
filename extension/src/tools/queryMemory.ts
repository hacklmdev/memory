import * as vscode from 'vscode';
import { readAllMemories } from '../storage/markdownStore';
import { searchMemories } from '../storage/search';

export interface QueryMemoryInput {
  query: string;
  category?: 'Instruction' | 'Quirk' | 'Preference' | 'Decision' | 'Security';
  limit?: number;
}

export class QueryMemoryTool implements vscode.LanguageModelTool<QueryMemoryInput> {
  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<QueryMemoryInput>,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: `Searching memory for "${options.input.query}"…`,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<QueryMemoryInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const { query, category, limit } = options.input;

    try {
      const maxResults = Math.min(limit ?? 10, 20);
      const entries = await readAllMemories();

      const results = searchMemories(entries, query, { limit: maxResults, category });

      if (results.length === 0) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(`No memories found matching "${query}".`),
        ]);
      }

      const formatted = results
        .map(r => `[${r.category}] ${r.content}`)
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
