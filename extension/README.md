# HackLM Memory

<p align="center">
  <img src="https://raw.githubusercontent.com/hacklmdev/memory/main/extension/icon.png" alt="HackLM Memory" width="128" />
</p>

<p align="center">
  A long-term memory layer for VS Code Copilot.<br/>
  Learns from your conversations. Stays local. Gets smarter over time.
</p>

---

## What It Does

HackLM Memory gives Copilot a persistent memory across sessions. It stores decisions, preferences, quirks, and security rules in plain Markdown files inside your project.

- **Learns passively** — picks up preferences and rules from natural conversation
- **Never stores duplicates** — deduplication runs on every write
- **Self-cleaning** — periodic cleanup merges similar entries and prunes stale ones
- **Workspace-scoped** — each project has its own `.memory/` folder
- **Fully local** — no cloud sync, no telemetry

---

## Getting Started

1. Install the extension
2. Open a workspace — memory files are created automatically in `.memory/`
3. Start chatting with Copilot — it will read and write memories automatically
4. Click **Memory** in the status bar to open the control panel

---

## Memory Categories

| Category | What It Stores |
|----------|----------------|
| **Instruction** | How Copilot should behave in this project |
| **Quirk** | Non-obvious project-specific knowledge |
| **Preference** | Style, tone, and design choices |
| **Decision** | Architectural commitments |
| **Security** | Rules that must never be broken |

---

## Commands

| Command | Description |
|---------|-------------|
| `HackLM Memory: Open Control Panel` | Browse all actions in one place |
| `HackLM Memory: List Memories` | View all stored entries |
| `HackLM Memory: Delete Memory` | Remove a specific entry |
| `HackLM Memory: Run Cleanup` | Merge duplicates and prune stale entries |
| `HackLM Memory: Review Session` | Find decisions not yet captured |
| `HackLM Memory: Open Memory Folder` | Browse `.memory/` files directly |

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `hacklm-memory.lmFamily` | `gpt-5-mini` | Model family for LM operations |
| `hacklm-memory.autoApproveStore` | `false` | Skip confirmation when saving memories |
| `hacklm-memory.manageInstructionFile` | `true` | Manage `.github/copilot-instructions.md` automatically |
| `hacklm-memory.autoCleanupFrequency` | `10` | Run cleanup automatically every N store operations |
| `hacklm-memory.categoryLimit.*` | `20` | Max entries per category |

---

## Privacy

All memory is stored locally in your workspace `.memory/` folder. Nothing leaves your machine.  
Add `.memory/` to `.gitignore` if any contents are sensitive.

---

## Requirements

- VS Code 1.99 or later
- GitHub Copilot (for LM tool integration)

---

## License

[GPL-3.0](https://github.com/vchan-in/memory/blob/main/LICENSE)
