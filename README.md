# HackLM Memory

[![CI](https://github.com/hacklmdev/memory/actions/workflows/ci.yml/badge.svg)](https://github.com/hacklmdev/memory/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Open VSX](https://img.shields.io/open-vsx/v/hacklm/hacklm-memory)](https://open-vsx.org/extension/hacklm/hacklm-memory)

A long-term memory layer for VS Code Copilot — learn from interactions, retain useful insights, and improve over time.

## What This Does

- **Learns passively**: picks up preferences, security rules, and quirks from natural conversation
- **Learns from mistakes**: stores lessons when commands fail or code is rejected
- **Dedup-aware**: never stores the same insight twice
- **Self-cleaning**: periodic cleanup merges duplicates and prunes stale memories
- **Reference-based**: `copilot-instructions.md` points to focused `.memory/` files — agents fetch on-demand
- **Workspace-scoped**: each project has its own `.memory/` folder

## Compatibility

Works in any Open VSX-compatible editor:

- [VS Code](https://code.visualstudio.com/) 1.99+
- [Google Antigravity](https://antigravity.google/) (Open VSX)
- [Gitpod](https://gitpod.io/) (Open VSX)

> **Note:** The memory LM tools (`storeMemory`, `queryMemory`) require the editor to implement the VS Code LM Tool API. Editors that do not implement this API will install the extension but the tools will not be available in chat.

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
| `HackLM Memory: Review Session` | Run gap analysis to find uncaptured decisions |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `hacklm-memory.lmFamily` | `gpt-5-mini` | Copilot model family for LM operations |
| `hacklm-memory.autoApproveStore` | `false` | Skip confirmation prompt when saving memories |
| `hacklm-memory.manageInstructionFile` | `true` | Allow the extension to manage `.github/copilot-instructions.md` |
| `hacklm-memory.categoryLimit.*` | varies | Per-category max entry counts |

## Privacy

- All memory is **local-only** — stored in workspace `.memory/` folder
- No cloud sync, no telemetry
- Full user visibility and control
- `.memory/` can be gitignored for sensitive projects

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

- [Architecture](docs/architecture.md) — module map, data flow, key design decisions
- [API Reference](docs/api-reference.md) — LM tool schemas, memory file format
- [Developer Guide](docs/contributing.md) — how to add categories, tools, and tests
- [Architecture Decision Records](docs/decisions.md) — 16 ADRs covering every major decision
- [Roadmap](docs/roadmap.md) — planned work and open contribution areas

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE).
