import * as vscode from 'vscode';
import { getMemoryCount } from './storage/markdownStore';
import { runCleanup } from './tools/cleanupMemory';
import { getOutputChannel } from './outputChannel';

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
      label: '$(play) Run Cleanup',
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
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Running memory cleanup...',
        cancellable: false,
      },
      async () => {
        const report = await runCleanup();

        const channel = getOutputChannel();
        channel.appendLine(report);
        channel.show(true);

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
      label: '$(hubot) Language Model',
      description: `Current: ${config.get('lmFamily', 'gpt-5-mini')}`,
      async action() {
        let availableModels: vscode.QuickPickItem[] = [];
        try {
          const allModels = await vscode.lm.selectChatModels();
          const families = [...new Set(allModels.map(m => m.family))].sort((a, b) => a.localeCompare(b));
          availableModels = families.map(f => ({
            label: f,
            description: allModels.find(m => m.family === f)?.name ?? '',
            picked: f === config.get('lmFamily', 'gpt-5-mini'),
          }));
        } catch {
        }

        if (availableModels.length === 0) {
          const family = await vscode.window.showInputBox({
            prompt: 'Enter the language model family to use (e.g. gpt-5-mini, gpt-4o, claude-sonnet)',
            value: String(config.get('lmFamily', 'gpt-5-mini')),
          });
          if (family) {
            await config.update('lmFamily', family, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Language model set to "${family}".`);
          }
          return;
        }

        const ENTER_MANUALLY = '$(edit) Enter manually…';
        availableModels.push({
          label: ENTER_MANUALLY,
          description: 'Type a custom model family name',
        });

        const selected = await vscode.window.showQuickPick(availableModels, {
          placeHolder: 'Select language model family for LLM operations',
        });

        if (!selected) { return; }

        let family: string | undefined = selected.label;

        if (family === ENTER_MANUALLY) {
          family = await vscode.window.showInputBox({
            prompt: 'Enter the language model family to use',
            value: String(config.get('lmFamily', 'gpt-5-mini')),
          });
        }

        if (family) {
          await config.update('lmFamily', family, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage(`Language model set to "${family}".`);
        }
      },
    },
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
          await config.update('autoCleanupFrequency', parseInt(frequency), vscode.ConfigurationTarget.Global);
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

  const channel = getOutputChannel();
  channel.clear();
  channel.appendLine('HackLM Memory — Statistics');
  channel.appendLine('─'.repeat(40));
  channel.appendLine(`Total memories : ${memoryCount}`);
  channel.appendLine(`Memory health  : ${memoryCount > 0 ? 'Active' : 'Empty'}`);
  channel.appendLine(`Memory files   : .memory/*.md`);
  channel.show(true);
}
