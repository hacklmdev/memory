import * as vscode from 'vscode';
import { generateInstructionFiles, ensureMemoryFiles } from './instructionFiles';
import { createStatusBar, updateStatusBar } from './statusBar';
import { showMemoryList, deleteMemoryInteractive, openMemoryFolder } from './storage/markdownStore';
import { showMemoryPanel, showMemoryStats } from './memoryPanel';
import { StoreMemoryTool } from './tools/storeMemory';
import { QueryMemoryTool } from './tools/queryMemory';
import { runCleanup } from './tools/cleanupMemory';
import { TOOL_IDS } from './toolIds';

const FIRST_ACTIVATION_KEY = 'hacklm-memory.firstActivation';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Register LM tools first — must run even without a workspace folder
  context.subscriptions.push(
    vscode.lm.registerTool(TOOL_IDS.STORE_MEMORY, new StoreMemoryTool(context)),
    vscode.lm.registerTool(TOOL_IDS.QUERY_MEMORY, new QueryMemoryTool())
  );

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return;
  }

  await ensureMemoryFiles(workspaceFolder);
  await generateInstructionFiles(workspaceFolder);

  const statusBar = createStatusBar(context);
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand('hacklm-memory.panel', showMemoryPanel),
    vscode.commands.registerCommand('hacklm-memory.stats', showMemoryStats),
    vscode.commands.registerCommand('hacklm-memory.list', showMemoryList),
    vscode.commands.registerCommand('hacklm-memory.delete', async () => {
      await deleteMemoryInteractive();
      await updateStatusBar();
    }),
    vscode.commands.registerCommand('hacklm-memory.open', openMemoryFolder),
    vscode.commands.registerCommand('hacklm-memory.reinit', async () => {
      await generateInstructionFiles(workspaceFolder);
      vscode.window.showInformationMessage('HackLM Memory: Instruction files regenerated.');
    }),
    vscode.commands.registerCommand('hacklm-memory.cleanup', async () => {
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Running memory cleanup...', cancellable: false },
          async () => {
            const report = await runCleanup(false);
            const outputChannel = vscode.window.createOutputChannel('HackLM Memory Cleanup');
            outputChannel.appendLine(report);
            outputChannel.show();
            const firstLine = report.split('\n')[0];
            vscode.window.showInformationMessage(firstLine);
          }
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Cleanup failed: ${err}`);
      }
    })
  );

  const memoryWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(workspaceFolder, '.memory/**/*.md')
  );
  memoryWatcher.onDidChange(() => updateStatusBar());
  memoryWatcher.onDidCreate(() => updateStatusBar());
  memoryWatcher.onDidDelete(() => updateStatusBar());
  context.subscriptions.push(memoryWatcher);

  const isFirstActivation = !context.globalState.get(FIRST_ACTIVATION_KEY);
  if (isFirstActivation) {
    await context.globalState.update(FIRST_ACTIVATION_KEY, true);
    vscode.window.showInformationMessage(
      'HackLM Memory is active! I\'ll learn your preferences as we chat.',
      'List Memories'
    ).then(action => {
      if (action === 'List Memories') {
        vscode.commands.executeCommand('hacklm-memory.list');
      }
    });
  }

}

export function deactivate(): void {}
