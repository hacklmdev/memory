import * as vscode from 'vscode';
import * as path from 'path';
import { readAllMemories, CATEGORY_FILES, type MemoryEntry } from './storage/markdownStore';

// ── Tree item types ───────────────────────────────────────────────────────────

export class CategoryItem extends vscode.TreeItem {
  constructor(
    public readonly category: string,
    public readonly count: number
  ) {
    super(
      category,
      count > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    this.description = count > 0 ? `${count}` : 'empty';
    this.iconPath = new vscode.ThemeIcon(categoryIcon(category));
    this.contextValue = 'memoryCategory';
    this.tooltip = `${category} — ${count} ${count === 1 ? 'entry' : 'entries'}`;
  }
}

export class MemoryItem extends vscode.TreeItem {
  constructor(public readonly entry: MemoryEntry) {
    super(entry.content, vscode.TreeItemCollapsibleState.None);
    this.description = entry.slug ? `[${entry.slug}]` : '';
    this.tooltip = new vscode.MarkdownString(
      `**${entry.category}**${entry.slug ? ` · \`${entry.slug}\`` : ''}\n\n${entry.content}`
    );
    this.iconPath = new vscode.ThemeIcon('circle-small-filled');
    this.contextValue = 'memoryEntry';
    this.command = {
      command: 'hacklm-memory.revealEntry',
      title: 'Open in editor',
      arguments: [entry],
    };
  }
}

function categoryIcon(category: string): string {
  switch (category) {
    case 'Instruction': return 'book';
    case 'Quirk':       return 'warning';
    case 'Preference':  return 'settings';
    case 'Decision':    return 'git-commit';
    case 'Security':    return 'shield';
    default:            return 'tag';
  }
}

// ── Tree data provider ────────────────────────────────────────────────────────

export type MemoryTreeNode = CategoryItem | MemoryItem;

export class MemoryTreeProvider implements vscode.TreeDataProvider<MemoryTreeNode> {
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<MemoryTreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: MemoryTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: MemoryTreeNode): Promise<MemoryTreeNode[]> {
    if (!element) {
      const entries = await readAllMemories();
      const countByCategory = new Map<string, number>();
      for (const e of entries) {
        countByCategory.set(e.category, (countByCategory.get(e.category) ?? 0) + 1);
      }
      return Object.keys(CATEGORY_FILES).map(
        cat => new CategoryItem(cat, countByCategory.get(cat) ?? 0)
      );
    }

    if (element instanceof CategoryItem) {
      const entries = await readAllMemories();
      return entries
        .filter(e => e.category === element.category)
        .map(e => new MemoryItem(e));
    }

    return [];
  }
}

// ── Reveal helper ─────────────────────────────────────────────────────────────

export async function revealEntry(entry: MemoryEntry): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) { return; }

  const filePath = path.join(folder.uri.fsPath, '.memory', entry.file);
  const uri = vscode.Uri.file(filePath);

  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });

    // Move cursor to the entry's line (1-based → 0-based)
    const line = Math.max(0, entry.lineNumber - 1);
    const pos = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  } catch {
    vscode.window.showErrorMessage(`Could not open memory file: ${entry.file}`);
  }
}
