# User Guide

This page covers every part of the HackLM Memory UI. For first-time setup, see [Getting Started](getting-started.md). For the `storeMemory` / `queryMemory` tool reference, see [API Reference](api-reference.md).

---

## Status Bar

The status bar item sits in the bottom-left corner of VS Code.

- **Default:** `⊕ Memory`
- **With memories:** `⊕ Memory (N)` — N is the total count across all categories

Click it to open the **Control Panel**.

---

## Memories View

The **Memories** panel lives in the Explorer sidebar (the file tree on the left). Expand it by clicking **Memories** in the Explorer.

### Categories

Memories are grouped into five categories: **Instruction**, **Quirk**, **Preference**, **Decision**, and **Security**. Each appears as a collapsible row with a count of stored entries. An empty category shows "empty".

For what each category is for and which file it maps to, see [API Reference → Memory Categories](api-reference.md#memory-categories).

### Memory entries

Click a category to expand it. Each entry shows:

- **Label** — the full memory content
- **Description** — the slug in brackets (e.g. `[esbuild-bundler]`), if one was set
- **Tooltip** — hover to see category, slug, and content together

Click an entry to open the source `.md` file in the editor and jump to that line.

### Empty state

When no memories exist, the panel shows:

> *No memories stored yet. Copilot will save insights here as you chat.*

A **[Open Control Panel]** link appears below it.

### Toolbar buttons

The row of icon buttons at the top of the Memories panel:

| Button | What it does |
|---|---|
| **Refresh** | Reloads the tree from disk |
| **Run Cleanup** | Merges duplicates and prunes stale entries |
| **Review Session** | Runs a gap analysis and suggests new memories to save |
| **Control Panel** | Opens the Control Panel Quick Pick |

### Entry context menu

Right-click any memory entry for these options:

- **Open Memory Entry** — opens the source file at that line
- **Delete Memory** — removes the entry after confirmation

A trash-can icon also appears inline on hover. Click it to delete directly.

---

## Control Panel

Open it by clicking the status bar item, clicking the menu icon in the Memories toolbar, or running `HackLM Memory: Open Control Panel` from the Command Palette.

| Option | What it does |
|---|---|
| **Browse Memories** | Opens a searchable list of all stored entries |
| **Delete Memory** | Prompts you to pick an entry and delete it |
| **Run Cleanup** | Merges duplicates, prunes stale entries; results go to the Output channel |
| **Reinitialize Files** | Regenerates `.github/copilot-instructions.md` from scratch |
| **Configure Memory System** | Opens the Settings panel (see below) |
| **Open Memory Folder** | Reveals the `.memory/` folder in the Explorer |

### Settings panel

Select **Configure Memory System** in the Control Panel to open the nested settings picker:

| Option | What it configures |
|---|---|
| **Language Model** | The model family used for cleanup and gap analysis (saved globally) |
| **Auto-Cleanup Frequency** | Run cleanup automatically every N store operations, 1–100 (saved globally) |
| **Category Size Limits** | Max entries per category before the oldest are pruned, 1–50 (saved per workspace) |

---

## Additional Commands

All Control Panel actions are also available in the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) — type **HackLM** to filter. Two commands have no equivalent in the Control Panel:

| Command | What it does |
|---|---|
| `View Statistics` | Prints total count, health summary, and file paths to the Output channel |
| `Open Getting Started` | Opens the built-in walkthrough |

---

## Settings

All settings are under `hacklm-memory.*`. Open them in **Settings UI** (`Ctrl+,`) and search for `hacklm-memory`, or configure them through the [Control Panel](#control-panel).

| Setting | Default | Scope | Description |
|---|---|---|---|
| `lmFamily` | `gpt-5-mini` | Global | Model family for cleanup and gap analysis |
| `autoCleanupFrequency` | `10` | Global | Auto-cleanup after every N store operations |
| `autoApproveStore` | `false` | Global | Skip the confirmation prompt when saving memories |
| `manageInstructionFile` | `true` | Global | Allow the extension to manage the `<!-- hacklm-memory -->` block in `.github/copilot-instructions.md` |
| `categoryLimit.Instruction` | `15` | Workspace | Max entries in the Instruction category |
| `categoryLimit.Quirk` | `20` | Workspace | Max entries in the Quirk category |
| `categoryLimit.Preference` | `20` | Workspace | Max entries in the Preference category |
| `categoryLimit.Decision` | `20` | Workspace | Max entries in the Decision category |
| `categoryLimit.Security` | `15` | Workspace | Max entries in the Security category |

---

## Built-in Walkthrough

A step-by-step walkthrough is built into VS Code. Open it from **Help → Get Started** and search for **HackLM Memory**, or run `HackLM Memory: Open Getting Started` from the Command Palette.

The walkthrough covers installation, opening the Memories view, storing your first memory, and configuring the language model.
