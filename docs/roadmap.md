# Roadmap

## Current State (v1.0.0)

HackLM Memory is a fully functional VS Code extension providing persistent long-term memory for GitHub Copilot. The core pipeline — store, query, dedup, score, cleanup, gap analysis — is complete and working.

Supported editors:
- VS Code 1.99+

---

## Open Contribution Areas

These are areas where contributions are most welcome. Open an issue first to discuss before starting large changes.

### Test Coverage Expansion

Current tests cover `storage/` (dedup, scoring, search). The `tools/` layer (`storeMemory`, `queryMemory`, `cleanupMemory`, `sessionReview`) has no automated tests. These require a VS Code extension test harness (e.g. `@vscode/test-electron`). A contributor who sets this up would make a significant impact.

Start in `extension/src/tools/`.

### LM API Compatibility Matrix

VS Code 1.99+ is confirmed working. Other Open VSX-compatible editors are untested. Contributions testing HackLM Memory in additional editors and documenting results are welcome.

### Export / Import

There is no way to back up or migrate `.memory/` content between machines. An export command (ZIP or single Markdown) and an import command would make the extension more useful for teams.

Start in `extension/src/storage/markdownStore.ts`.

### Improved Gap Analysis Prompts

`sessionReview.ts` uses a fixed prompt for gap analysis. Better prompts that are more context-aware (e.g. considering the current project type or recent tool calls) could improve suggestion quality.

Start in `extension/src/tools/sessionReview.ts`.

### Settings UI Improvements

The current settings UI is functional but minimal. A webview-based settings panel could make it easier to browse, edit, and reorder memory entries directly.

Start in `extension/src/memoryPanel.ts`.

### Per-workspace Memory Toggle

Currently the tool registers globally. A per-workspace enable/disable toggle would be useful for projects where memory is not desirable.

Start in `extension/src/utils.ts` and `extension/package.json`.

---

## Planned Future Work

### Additional Editor Support (MCP-based)

**Status:** Not started. Architecture decided — MCP-based.

Google Antigravity supports MCP (Model Context Protocol), which allows tools to be called by the agent without the VS Code extension API. The plan:

1. Extract the storage layer (`dedup.ts`, `scoring.ts`, `search.ts`, `markdownStore.ts`) into a shared `packages/storage` package (plain TypeScript/Node, no VS Code dependency).
2. Build an `mcp/` package — an MCP server that implements `storeMemory` and `queryMemory` tools backed by the shared storage layer.
3. The MCP server accepts `workspaceRoot` as a tool parameter rather than reading from VS Code context.
4. LM-based deduplication (redundancy check) is omitted from the MCP server — Jaccard fuzzy matching alone is used. No VS Code LM API equivalent exists in this context.
5. Gap analysis / session review is omitted from the MCP server — no user prompt UI is available.
6. Antigravity wires it up via `mcp_config.json`; a `.agent/skills/memory/SKILL.md` tells the agent when to call the tools.

The `.memory/*.md` file format is the stable, editor-agnostic contract. Any implementation must read/write that format correctly for memory to be shareable across editors.

See [ADR 0017](decisions.md#0017--additional-editor-support-via-mcp) for the architectural decision record.

### JetBrains Support

**Status:** Not started. Deferred until a maintainer or contributor with JetBrains plugin experience volunteers.

What this requires:
1. The `packages/storage` extraction from the Antigravity work above (prerequisite).
2. A separate Kotlin/Java IntelliJ Platform plugin that implements the same `.memory/*.md` file format (spec in [api-reference.md](api-reference.md)) and integrates with JetBrains AI Assistant's tool/agent API.
3. Publish the JetBrains plugin to [plugins.jetbrains.com](https://plugins.jetbrains.com/).

See [ADR 0016](decisions.md#0016--vs-code-first-jetbrains-deferred) for the architectural decision record.

### Neovim / Other Editors

Similar to JetBrains — requires a separate plugin implementation using the relevant editor's extension API. The `packages/storage` extraction above is a prerequisite.
