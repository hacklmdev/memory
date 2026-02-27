import * as vscode from 'vscode';
import { generateInstructionFiles, ensureMemoryFiles } from './instructionFiles';
import { createStatusBar, updateStatusBar } from './statusBar';
import { showMemoryList, deleteMemoryInteractive, openMemoryFolder } from './storage/markdownStore';
import { showMemoryPanel, showMemoryStats, runCleanupInteractive } from './memoryPanel';
import { StoreMemoryTool } from './tools/storeMemory';
import { QueryMemoryTool } from './tools/queryMemory';
import { TOOL_IDS } from './toolIds';
import { MemoryTreeProvider, revealEntry } from './memoryTreeView';
import { disposeOutputChannel } from './outputChannel';
import { runSessionReview } from './tools/sessionReview';
import { FIRST_ACTIVATION_KEY, INSTRUCTION_CONSENT_KEY } from './globalStateKeys';

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

  const manageFile = vscode.workspace.getConfiguration('hacklm-memory').get<boolean>('manageInstructionFile', true);

  if (manageFile) {
    // Already shown consent — just regenerate. First run: prompt the user.
    const consentShown = context.globalState.get<boolean>(INSTRUCTION_CONSENT_KEY, false);
    if (consentShown) {
      await generateInstructionFiles(workspaceFolder);
    } else {
      await context.globalState.update(INSTRUCTION_CONSENT_KEY, true);
      const choice = await vscode.window.showInformationMessage(
        'HackLM Memory will manage the `.github/copilot-instructions.md` file in your workspace to inject memory references. You can disable this in Settings.',
        'OK',
        'Disable'
      );
      if (choice === 'Disable') {
        await vscode.workspace.getConfiguration('hacklm-memory').update('manageInstructionFile', false, vscode.ConfigurationTarget.Global);
      } else {
        await generateInstructionFiles(workspaceFolder);
      }
    }
  }

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
    vscode.commands.registerCommand('hacklm-memory.cleanup', runCleanupInteractive),
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
  context.subscriptions.push(
    memoryWatcher,
    vscode.lm.onDidChangeChatModels(() => updateStatusBar())
  );

  if (!context.globalState.get(FIRST_ACTIVATION_KEY)) {
    await context.globalState.update(FIRST_ACTIVATION_KEY, true);
    await vscode.commands.executeCommand('hacklm-memory.openWalkthrough');
  }

}

export function deactivate(): void {
  disposeOutputChannel();
}
