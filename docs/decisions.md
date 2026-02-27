# Architecture Decision Records

Significant design choices — why each was made, what alternatives were rejected, and the consequences.

---

## 0001 — Tree View for Browsing Memories

**Status:** Accepted

### Context

Memories need to be browsable. An early prototype used a QuickPick list. QuickPick is a transient input widget — it dismisses on focus loss and cannot persist state.

### Decision

Use a `TreeDataProvider` registered to a named view (`hacklm-memory.memoriesView`) for browsing memories. Keep QuickPick only for the control panel (a transient action menu, not a browsing surface).

### Consequences

- The tree view lives in the Explorer sidebar, grouped by category.
- Users can see all memories at a glance without opening a transient widget.
- `MemoryTreeProvider` in `memoryTreeView.ts` owns this view.
- QuickPick (`memoryPanel.ts`) is limited to control panel actions (cleanup, delete, settings).

---

## 0002 — Output Channel Singleton

**Status:** Accepted

### Context

Multiple commands (cleanup, session review) need to write output to the user. A naive implementation would call `vscode.window.createOutputChannel()` in each operation, creating duplicate channels in the Output panel.

### Decision

Use a lazy singleton `OutputChannel` defined in `outputChannel.ts`. One shared instance per extension activation. Never call `createOutputChannel()` per operation.

### Consequences

- `getOutputChannel()` returns the singleton, creating it on first call via `??=`.
- `disposeOutputChannel()` is called in `deactivate()` to clean up.
- All cleanup reports and LM error logs go to the same "HackLM Memory" output channel.
- Contributors must import from `outputChannel.ts` — never create a new channel inline.

---

## 0003 — Hide Internal Commands from Command Palette

**Status:** Accepted

### Context

Some commands are registered in `extension.ts` for internal use (e.g. `hacklm-memory.revealEntry` is called programmatically from the tree view, not by users). Showing these in the Command Palette creates noise.

### Decision

Use `"commandPalette": [{"command": "...", "when": "false"}]` in `extension/package.json` under `menus` to hide internal commands from the palette.

### Consequences

- Internal commands are registered and functional but invisible in the Command Palette.
- User-facing commands remain visible and searchable.
- All commands still appear in keyboard shortcut settings where users can bind them if desired.

---

## 0004 — Tree View Collapsed by Default

**Status:** Accepted

### Context

VS Code tree views registered in `contributes.views` can have an initial visibility. Without configuration, a new view may automatically expand on first install, disrupting the Explorer sidebar.

### Decision

All registered tree views default to `"visibility": "collapsed"` in `package.json`.

### Consequences

- New installs do not hijack the Explorer sidebar.
- Users who want the view open can expand it once; VS Code remembers the state.

---

## 0005 — viewsWelcome Required for Every Tree View

**Status:** Accepted

### Context

When a tree view has no data, VS Code shows a blank panel by default. This is confusing for new users who have not stored any memories yet.

### Decision

Always add a `viewsWelcome` contribution for every registered tree view. Also set `treeView.message` in code for dynamic empty states after initial load.

### Consequences

- New users see a helpful message instead of a blank panel.
- The `viewsWelcome` entry handles the initial empty state. The `treeView.message` property handles cases where memories are deleted after initial load.

---

## 0006 — Centralised LM Calls

**Status:** Accepted

### Context

Multiple modules need LM requests (storeMemory, cleanupMemory, sessionReview). Without centralisation, each would independently call `vscode.lm.selectChatModels` and handle timeouts, cancellation tokens, and error logging differently.

### Decision

All LM calls go through `lm.ts` (`resolveModel()` and `sendLmRequest()`). No module calls `vscode.lm.selectChatModels` or `sendRequest` directly.

### Consequences

- Fallback logic, timeout handling, cancellation token forwarding, and error logging are in one place.
- Model family selection is controlled by a single setting (`hacklm-memory.lmFamily`).
- If the LM API changes, only `lm.ts` needs updating.

---

## 0007 — LM Justification Required

**Status:** Accepted

### Context

VS Code's LM `sendRequest` accepts a `justification` string that appears in the permission prompt shown to the user. An empty string results in a blank reason.

### Decision

Every `sendLmRequest` call must pass a non-empty `justification`. The `SendLmRequestOptions` interface makes `justification` a required field. Passing an empty string is forbidden.

### Consequences

- Users always see a meaningful reason when an LM permission prompt appears.
- TypeScript enforces that callers provide a justification.

---

## 0008 — LM Cancellation Token Forwarding

**Status:** Accepted

### Context

LM tool `invoke()` methods receive a `vscode.CancellationToken`. Discarding it means users cannot cancel long-running LM calls.

### Decision

The `CancellationToken` from `invoke()` is always forwarded to `sendLmRequest()` via the `token` option. Parameters with unused tokens use the `_token` underscore prefix convention; any token that reaches an LM call must be passed through.

### Consequences

- Users can cancel LM operations via the VS Code progress notification.
- Long gap-analysis or redundancy-check calls do not block indefinitely.

---

## 0009 — LM Timeout Cleanup

**Status:** Accepted

### Context

`sendLmRequest` supports an optional `timeoutMs` parameter via `Promise.race`. A naive implementation never calls `clearTimeout`, leaving a dangling timer after the race resolves.

### Decision

`clearTimeout(timeoutHandle)` is called immediately after `Promise.race` resolves, regardless of which promise won.

### Consequences

- No dangling `setTimeout` handles after any `sendLmRequest` call.
- The `timedOut` flag ensures that if the response stream is still being consumed when the timeout fires, iteration stops cleanly.

---

## 0010 — Session Review Architecture

**Status:** Accepted

### Context

One design option was to instruct the Copilot model to self-trigger session review at the end of turns. The model cannot reliably self-trigger tool calls — turns can end abruptly.

### Decision

`sessionReview.ts` drives programmatic gap analysis. The extension triggers gap analysis automatically every 3rd successful `storeMemory` call (`triggerGapAnalysis()`). Users can also invoke it manually via the `HackLM Memory: Review Session` command.

### Consequences

- Gap analysis runs reliably at a known frequency without depending on model self-discipline.
- Both auto-trigger and manual review paths share the same analysis logic.
- The frequency (every 3 stores) is a candidate for a future user setting.

---

## 0011 — Cleanup Merge Threshold

**Status:** Accepted

### Context

Write-time dedup uses `SKIP_THRESHOLD=0.8` and `UPDATE_THRESHOLD=0.6`. Entries that passed those thresholds can still be semantically related enough to merge over time.

### Decision

Cleanup uses a separate merge threshold of 0.3 Jaccard similarity via `findSimilarClusters()`. The cleanup threshold is an independent constant — never unified with the write-time thresholds.

### Consequences

- Cleanup is more aggressive than write-time dedup. This is intentional — write-time dedup must be fast and conservative; cleanup runs less frequently and can afford broader merges.
- Two separate constant sets: `SKIP_THRESHOLD`/`UPDATE_THRESHOLD` (in `dedup.ts`) and the `threshold` parameter to `findSimilarClusters` (default 0.5, called with 0.3 in cleanup).

---

## 0012 — Gap Analysis — No Changelog

**Status:** Accepted

### Context

Without explicit constraints, the gap analysis LLM might suggest entries phrased as past events ("last cleanup removed 3 entries"). These are changelog entries, not memory.

### Decision

The gap analysis prompt explicitly forbids changelog or past-event suggestions. The LLM must only suggest forward-looking, present-tense guidelines — things that will still be relevant in a future session.

### Consequences

- Memory stays actionable and durable.
- Maintainers editing the gap analysis prompt must preserve this constraint.

---

## 0013 — Category Limits Rationale

**Status:** Accepted

### Context

Each memory category has a maximum entry count enforced during cleanup. Limits are set per-category based on observed growth rates and value.

### Decision

| Category | Limit | Rationale |
|----------|-------|-----------|
| Instruction | 15 | Low count, high value. Instructions should be crisp. |
| Decision | 20 | Grows fast on active projects. |
| Quirk | 20 | Accumulates over time. Cleanup keeps it relevant. |
| Preference | 20 | Style choices accumulate. |
| Security | 15 | Should be small and authoritative. |

All limits are user-configurable via `hacklm-memory.categoryLimit.<Category>` settings.

### Consequences

- Cleanup prunes the lowest-scoring entries when a category exceeds its limit.
- Users on large projects may need to increase limits via settings.

---

## 0014 — Model Resolution

**Status:** Accepted

### Context

Multiple modules need a `LanguageModelChat` instance. Without centralisation, each would call `vscode.lm.selectChatModels` independently with potentially different family strings.

### Decision

Model resolution always happens in `lm.ts`. `resolveFamily()` reads `hacklm-memory.lmFamily` (default `gpt-5-mini`). `resolveModel()` calls `selectChatModels` with that family and returns the first result or `null`. Callers never call `selectChatModels` directly.

### Consequences

- One place to update if the LM selection API changes.
- Callers treat `null` as "LM unavailable — proceed without" (fail-open).

---

## 0015 — GPL v3.0 License

**Status:** Accepted

### Context

The project was originally licensed under MIT. The maintainer switched to a copyleft license to ensure derivative works remain open source.

### Decision

The project uses GNU General Public License v3.0 (`GPL-3.0-only`). Applies to all source in the repository. `"license": "GPL-3.0-only"` in both `package.json` files.

### Consequences

- Anyone distributing a modified version must release modifications under GPL v3.0.
- End users can use the extension freely without restriction.
- Contributors agree their contributions are licensed under GPL v3.0 (stated in `CONTRIBUTING.md`).

---

## 0016 — VS Code-First, JetBrains Deferred

**Status:** Accepted

### Context

HackLM Memory could theoretically support multiple editors. JetBrains requires a fundamentally different technology stack (Kotlin, IntelliJ Platform).

### Decision

The initial release targets **VS Code-based editors only**: VS Code and any Open VSX-compatible editor. JetBrains support is deferred until a maintainer with JetBrains plugin experience volunteers.

### Consequences

- The extension is written in TypeScript against the VS Code extension API exclusively.
- The VS Code LM Tool API (`vscode.lm.registerTool`, `vscode.lm.selectChatModels`) has no JetBrains equivalent.
- The storage layer (`dedup.ts`, `scoring.ts`, `search.ts`, `markdownStore.ts`) has no `vscode` dependency and could be extracted into a `core/` package for a future JetBrains port.
- The `.memory/*.md` file format (documented in [`api-reference.md`](api-reference.md)) is the stable, editor-agnostic contract any future implementation must honour.
