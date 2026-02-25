import * as vscode from 'vscode';
import { getMemoryCount } from './storage/markdownStore';

let statusBarItem: vscode.StatusBarItem;

/**
 * Create and show the persistent Memory Agent status bar button.
 */
export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );

  statusBarItem.command = 'hacklm-memory.panel';
  statusBarItem.tooltip = 'HackLM Memory — click to open control panel';
  statusBarItem.show();

  updateStatusBar();

  return statusBarItem;
}

/**
 * Update the status bar text with current memory count.
 */
export async function updateStatusBar(): Promise<void> {
  if (!statusBarItem) return;

  try {
    const count = await getMemoryCount();
    statusBarItem.text = `$(brain) Memory (${count})`;
  } catch {
    statusBarItem.text = '$(brain) Memory';
  }
}
