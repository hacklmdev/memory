# Contributing to HackLM Memory

Thank you for your interest in contributing.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [VS Code](https://code.visualstudio.com/) 1.99+ (or any Open VSX-compatible editor, e.g. Google Antigravity)
- Git

## Build

```bash
# Install all dependencies
npm install

# Build the extension bundle (esbuild → extension/dist/extension.js)
npm run build
```

Both commands run from the repo root and delegate to `extension/`.

## Run Tests

```bash
cd extension
npm test
```

Tests use [Vitest](https://vitest.dev/). The test suite covers the pure-function storage layer (`dedup`, `scoring`, `search`) with no VS Code runtime dependency.

## Debugging in VS Code

1. Open the repo root in VS Code.
2. Press `F5` — this launches the **Extension Development Host** using the settings in `.vscode/launch.json`.
3. The extension activates in the new window. Open a workspace folder and start a Copilot Chat session to test `storeMemory` / `queryMemory`.

## Folder Structure

```
extension/
  src/
    extension.ts        ← activation entry point
    lm.ts               ← all LM calls (single choke point)
    instructionFiles.ts ← manages .github/copilot-instructions.md
    memoryPanel.ts      ← QuickPick control panel
    memoryTreeView.ts   ← Explorer sidebar tree
    statusBar.ts        ← status bar item
    toolIds.ts          ← LM tool name constants
    utils.ts            ← per-category limit helper
    outputChannel.ts    ← shared output channel singleton
    storage/
      markdownStore.ts  ← read/write .memory/*.md (with per-file mutex)
      dedup.ts          ← Jaccard similarity deduplication
      scoring.ts        ← entry scoring for cleanup pruning
      search.ts         ← keyword-based search for queryMemory
    tools/
      storeMemory.ts    ← storeMemory LM tool
      queryMemory.ts    ← queryMemory LM tool
      cleanupMemory.ts  ← cleanup: merge, prune, slug assignment
      sessionReview.ts  ← gap analysis and session review
  media/                ← walkthrough step content
  package.json          ← extension manifest
  tsconfig.json
docs/                   ← architecture, API reference, ADRs, roadmap
```

## Coding Conventions

| Rule | Detail |
|------|--------|
| **All LM calls go through `lm.ts`** | Never call `vscode.lm.selectChatModels` or `sendRequest` directly in other modules. Use `resolveModel()` and `sendLmRequest()`. |
| **Per-file mutex in `markdownStore.ts`** | All `.memory/*.md` writes use `withFileLock()`. Never bypass the lock. |
| **globalState keys are constants** | All `globalState` key names are defined as named constants. Never use bare string keys. |
| **Fail-open LM calls** | `sendLmRequest` returns `string \| null`. Callers treat `null` as "proceed without LM assistance". |
| **`markdownDescription` for settings** | All extension settings use `markdownDescription`, not `description`. |
| **No emojis in code** | — |
| **Void-cast fire-and-forget** | Use `void promise.then(...)` for intentional fire-and-forget. |
| **TypeScript strict mode** | `tsconfig.json` has `"strict": true`. No `any` without justification. |

## Commit Style

Use conventional commits:

```
feat: add per-category export command
fix: handle empty query in searchMemories
docs: update architecture diagram
test: add scoring edge case for empty content
```

## Pull Request Checklist

Before opening a PR:

- [ ] `npm run build` succeeds without errors
- [ ] `npm test` passes (all tests green)
- [ ] New behaviour is documented in `docs/` if it affects architecture or API
- [ ] If an architectural decision was made, an ADR has been added to `docs/decisions.md`
- [ ] No new bare `globalState` keys (use the constants file)
- [ ] No direct `vscode.lm` calls outside `lm.ts`

## License

By contributing, you agree your contributions are licensed under the [GNU General Public License v3.0](LICENSE).
