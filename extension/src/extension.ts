import * as vscode from 'vscode';
import { generateInstructionFiles, ensureMemoryFiles } from './instructionFiles';
import { createStatusBar, updateStatusBar } from './statusBar';
import { showMemoryList, deleteMemoryInteractive, openMemoryFolder } from './storage/markdownStore';
import { showMemoryPanel, showMemoryStats } from './memoryPanel';
import { StoreMemoryTool } from './tools/storeMemory';
import { QueryMemoryTool } from './tools/queryMemory';
import { runCleanup } from './tools/cleanupMemory';
import { TOOL_IDS } from './toolIds';
import { MemoryTreeProvider, revealEntry } from './memoryTreeView';
import { getOutputChannel, disposeOutputChannel } from './outputChannel';

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

  // Tree view
  const treeProvider = new MemoryTreeProvider();
  const treeView = vscode.window.createTreeView('hacklm-memory.memoriesView', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  context.subscriptions.push(
    vscode.commands.registerCommand('hacklm-memory.panel', showMemoryPanel),
    vscode.commands.registerCommand('hacklm-memory.stats', showMemoryStats),
    vscode.commands.registerCommand('hacklm-memory.list', showMemoryList),
    vscode.commands.registerCommand('hacklm-memory.refresh', () => treeProvider.refresh()),
    vscode.commands.registerCommand('hacklm-memory.revealEntry', revealEntry),
    vscode.commands.registerCommand('hacklm-memory.delete', async () => {
      await deleteMemoryInteractive();
      await updateStatusBar();
      treeProvider.refresh();
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
    })
  );

  const memoryWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(workspaceFolder, '.memory/**/*.md')
  );
  const onMemoryChange = () => { updateStatusBar(); treeProvider.refresh(); };
  memoryWatcher.onDidChange(onMemoryChange);
  memoryWatcher.onDidCreate(onMemoryChange);
  memoryWatcher.onDidDelete(onMemoryChange);
  context.subscriptions.push(memoryWatcher);

  const isFirstActivation = !context.globalState.get(FIRST_ACTIVATION_KEY);
  if (isFirstActivation) {
    await context.globalState.update(FIRST_ACTIVATION_KEY, true);
    void vscode.window.showInformationMessage(
      'HackLM Memory is active! I\'ll learn your preferences as we chat.',
      'List Memories'
    ).then(action => {
      if (action === 'List Memories') {
        void vscode.commands.executeCommand('hacklm-memory.list');
      }
    });
  }

}

export function deactivate(): void {
  disposeOutputChannel();
}
