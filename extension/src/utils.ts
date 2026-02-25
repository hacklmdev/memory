import * as vscode from 'vscode';
import { CATEGORY_LIMITS } from './storage/markdownStore';

/** Read category limits from config, falling back to compiled defaults. */
export function getEffectiveLimit(category: string): number {
  const config = vscode.workspace.getConfiguration('hacklm-memory');
  return config.get<number>(`categoryLimit.${category}`, CATEGORY_LIMITS[category] ?? 20);
}

/** Calculate the number of days between two ISO date strings. */
export function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.abs(Math.round((b - a) / (1000 * 60 * 60 * 24)));
}
