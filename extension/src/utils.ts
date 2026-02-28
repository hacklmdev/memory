import * as vscode from 'vscode';

export function getEffectiveLimit(category: string): number {
  const config = vscode.workspace.getConfiguration('hacklm-memory');
  return config.get<number>(`categoryLimit.${category}`, 40);
}
