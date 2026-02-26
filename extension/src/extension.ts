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
import { runSessionReview } from './tools/sessionReview';

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
    vscode.commands.registerCommand('hacklm-memory.reviewSession', runSessionReview),
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
            const report = await runCleanup();
            const channel = getOutputChannel();
            channel.appendLine(report);
            channel.show(true);
            const summary = report.split('\n').find(l => /^(Memory is|After:|Merged:|Pruned:)/.test(l.trim())) ?? report.split('\n').find(l => l.trim().length > 0) ?? 'Done.';
            vscode.window.showInformationMessage(summary);
          }
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Cleanup failed: ${err}`);
      }
    }),
    vscode.commands.registerCommand('hacklm-memory.openWalkthrough', async () => {
      await vscode.commands.executeCommand('setContext', 'hacklm-memory.walkthroughStarted', true);
      await vscode.commands.executeCommand(
        'workbench.action.openWalkthrough',
        { category: 'hacklm.hacklm-memory#hacklm-memory.gettingStarted' }
      );
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

  context.subscriptions.push(
    vscode.lm.onDidChangeChatModels(() => updateStatusBar())
  );

  const isFirstActivation = !context.globalState.get(FIRST_ACTIVATION_KEY);
  if (isFirstActivation) {
    await context.globalState.update(FIRST_ACTIVATION_KEY, true);
    await vscode.commands.executeCommand('hacklm-memory.openWalkthrough');
  }

}

export function deactivate(): void {
  disposeOutputChannel();
}
