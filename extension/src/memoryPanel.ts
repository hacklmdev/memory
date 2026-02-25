import * as vscode from 'vscode';
import { getMemoryCount } from './storage/markdownStore';
import { runCleanup } from './tools/cleanupMemory';

/**
 * Memory Control Panel — central place to browse, clean and configure memories.
 */

interface PanelAction {
  label: string;
  description?: string;
  action: () => Promise<void>;
}

export async function showMemoryPanel(): Promise<void> {
  const memoryCount = await getMemoryCount();

  const actions: PanelAction[] = [
    {
      label: '$(list-unordered) Browse Memories',
      description: `${memoryCount} memories stored`,
      action: async () => { await vscode.commands.executeCommand('hacklm-memory.list'); },
    },
    {
      label: '$(trash) Delete Memory',
      description: 'Remove a specific memory entry',
      action: async () => { await vscode.commands.executeCommand('hacklm-memory.delete'); },
    },
    {
      label: '$(brush) Run Cleanup',
      description: 'Merge duplicates, prune stale entries',
      action: async () => { await runCleanupInteractive(); },
    },
    {
      label: '$(refresh) Reinitialize Files',
      description: 'Regenerate copilot-instructions.md from scratch',
      action: async () => { await vscode.commands.executeCommand('hacklm-memory.reinit'); },
    },
    {
      label: '$(gear) Configure Memory System',
      description: 'Set cleanup frequency, category limits, etc.',
      action: async () => { await showSettings(); },
    },
    {
      label: '$(folder-opened) Open Memory Folder',
      description: 'Browse .memory/ files directly',
      action: async () => { await vscode.commands.executeCommand('hacklm-memory.open'); },
    },
  ];

  const selected = await vscode.window.showQuickPick(actions, {
    placeHolder: 'HackLM Memory — Control Panel',
    matchOnDescription: true,
  });

  if (selected) {
    await selected.action();
  }
}

async function runCleanupInteractive(): Promise<void> {
  const dryRun = await vscode.window.showQuickPick(
    [
      { label: '$(play) Run Cleanup Now', value: false },
      { label: '$(eye) Preview Changes (Dry Run)', value: true },
    ],
    { placeHolder: 'Cleanup mode' }
  );

  if (!dryRun) { return; }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Running memory cleanup...',
        cancellable: false,
      },
      async () => {
        const report = await runCleanup(dryRun.value);

        const outputChannel = vscode.window.createOutputChannel('HackLM Memory Cleanup');
        outputChannel.appendLine(report);
        outputChannel.show();

        const firstLine = report.split('\n').find(l => l.trim().length > 0) ?? 'Done.';
        vscode.window.showInformationMessage(firstLine);
      }
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Cleanup failed: ${err}`);
  }
}

async function showSettings(): Promise<void> {
  const config = vscode.workspace.getConfiguration('hacklm-memory');

  const options = [
    {
      label: '$(symbol-numeric) Auto-Cleanup Frequency',
      description: `Current: every ${config.get('autoCleanupFrequency', 10)} store operations`,
      async action() {
        const frequency = await vscode.window.showInputBox({
          prompt: 'Run cleanup automatically after how many store operations?',
          value: String(config.get('autoCleanupFrequency', 10)),
          validateInput: (v) => {
            const num = parseInt(v);
            return num > 0 && num <= 100 ? null : 'Must be between 1 and 100';
          },
        });
        if (frequency) {
          await config.update('autoCleanupFrequency', parseInt(frequency), vscode.ConfigurationTarget.Workspace);
          vscode.window.showInformationMessage(`Auto-cleanup set to every ${frequency} store operations.`);
        }
      },
    },
    {
      label: '$(output) Category Size Limits',
      description: 'How many memories to keep per category',
      async action() {
        const categories = ['Instruction', 'Quirk', 'Preference', 'Decision', 'Security'];
        const selected = await vscode.window.showQuickPick(
          categories.map(c => ({
            label: c,
            description: `Current limit: ${config.get(`categoryLimit.${c}`, 20)}`,
            category: c,
          })),
          { placeHolder: 'Select category to configure' }
        );

        if (!selected) { return; }

        const newLimit = await vscode.window.showInputBox({
          prompt: `Max memories for ${selected.category}`,
          value: String(config.get(`categoryLimit.${selected.category}`, 20)),
          validateInput: (v) => {
            const num = parseInt(v);
            return num > 0 && num <= 50 ? null : 'Must be between 1 and 50';
          },
        });

        if (newLimit) {
          await config.update(
            `categoryLimit.${selected.category}`,
            parseInt(newLimit),
            vscode.ConfigurationTarget.Workspace
          );
          vscode.window.showInformationMessage(`${selected.category} limit set to ${newLimit}.`);
        }
      },
    },
  ];

  const selected = await vscode.window.showQuickPick(options, {
    placeHolder: 'Configure HackLM Memory',
    matchOnDescription: true,
  });

  if (selected) {
    await selected.action();
  }
}

export async function showMemoryStats(): Promise<void> {
  const memoryCount = await getMemoryCount();

  const stats = [
    { label: '$(database) Total Memories', description: String(memoryCount) },
    { label: '$(calendar) Last Cleanup', description: 'Check .memory/cleanup.log' },
    { label: '$(pulse) Memory Health', description: memoryCount > 0 ? '✓ Active' : 'Empty' },
  ];

  await vscode.window.showQuickPick(stats, {
    placeHolder: 'HackLM Memory — Statistics',
  });
}
