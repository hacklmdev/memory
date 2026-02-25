# HackLM Memory

A long-term memory layer for VS Code Copilot — learn from interactions, retain useful insights, and improve over time.

## What This Does

- **Learns passively**: picks up preferences, security rules, and quirks from natural conversation
- **Learns from mistakes**: stores lessons when commands fail or code is rejected
- **Dedup-aware**: never stores the same insight twice
- **Self-cleaning**: periodic cleanup merges duplicates and prunes stale memories
- **Auto-discovers**: scans `package.json` to document build commands in AGENTS.md
- **Reference-based**: `copilot-instructions.md` points to focused `.memory/` files — agents fetch on-demand
- **Workspace-scoped**: each project has its own `.memory/` folder

## Architecture

| Component | Role |
|-----------|------|
| `extension/` | VS Code extension — registers LM tools, commands, UI |
| `.memory/` | Markdown memory files (instructions, quirks, preferences, decisions, security) |

## Getting Started

### Build

```bash
npm install
npm run build
```

### Activate

1. Open this workspace in VS Code
2. The extension activates automatically and registers LM tools
3. Click the status bar item to view memory statistics
4. Start chatting — Copilot will read and write memories automatically

## Memory Categories

| Category | File | What It Stores |
|----------|------|---------------|
| Instruction | `.memory/instructions.md` | How Copilot should behave |
| Quirk | `.memory/quirks.md` | Project-specific weirdness — the non-obvious stuff |
| Preference | `.memory/preferences.md` | Style, tone, design choices |
| Decision | `.memory/decisions.md` | Architectural commitments |
| Security | `.memory/security.md` | Rules that must NEVER be broken |

## Commands

| Command | Description |
|---------|-------------|
| `HackLM Memory: Open Control Panel` | Open the memory control panel |
| `HackLM Memory: View Statistics` | View memory statistics |
| `HackLM Memory: List Memories` | View all stored memories |
| `HackLM Memory: Delete Memory` | Remove a specific entry |
| `HackLM Memory: Open Memory Folder` | Open `.memory/` in editor |
| `HackLM Memory: Reinitialize Instruction Files` | Regenerate instruction files |
| `HackLM Memory: Run Cleanup` | Manually trigger memory cleanup |

## Privacy

- All memory is **local-only** — stored in workspace `.memory/` folder
- No cloud sync, no telemetry
- Full user visibility and control
- `.memory/` can be gitignored for sensitive projects
