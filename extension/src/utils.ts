import * as vscode from 'vscode';
import { CATEGORY_LIMITS } from './storage/markdownStore';

export function getEffectiveLimit(category: string): number {
  const config = vscode.workspace.getConfiguration('hacklm-memory');
  return config.get<number>(`categoryLimit.${category}`, CATEGORY_LIMITS[category] ?? 20);
}
