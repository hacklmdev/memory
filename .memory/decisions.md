# Decision

Memories stored by HackLM Memory.

- [no-session-debrief] Removed last-session-debrief rule. Can't enforce turn-end tool calls. Rule created false contract.

- [tree-view-for-browsing] Use a TreeDataProvider + registered view for browsing memories. Quick Pick is a transient input widget, not a browsing surface.

- [output-channel-singleton] One shared OutputChannel per extension. Never call createOutputChannel() per operation. Use a lazy singleton in outputChannel.ts.

- [hide-internal-commands] Hide internal commands from Command Palette via "commandPalette": [{"when": "false"}] in package.json menus.

- [tree-view-collapsed-default] Tree views default to "visibility": "collapsed" in package.json. Prevents the view hijacking Explorer on first install.

- [views-welcome-required] Always add a viewsWelcome contribution for every registered tree view. It shows guidance when the tree is empty instead of a blank panel.

- [lm-calls-centralized] All LM calls go through lm.ts (resolveModel + sendLmRequest). No inline selectChatModels or sendRequest anywhere else.

- [lm-justification-required] Every sendRequest call includes a justification string. It populates the VS Code permission prompt. Never pass an empty options object {}.

- [lm-cancellation-token] CancellationToken from tool invoke() is forwarded to sendLmRequest. Users can cancel long LM calls. Never discard the token with _token.

- [lm-timeout-cleanup] LM timeouts use clearTimeout after Promise.race resolves. Never leave a setTimeout handle dangling after the LM call completes.

- [session-review-architecture] sessionReview.ts drives programmatic storeMemory enforcement. It makes its own LM call after every Nth store. Extension controls when and what gets stored — model does not need to self-trigger.

- [cleanup-merge-threshold] Cleanup merge threshold is 0.3 (Jaccard). Catches semantically related entries the 0.5 threshold missed. checkDuplicate thresholds (0.8/0.6) are separate — they guard writes, not cleanup.

- [no-cleanup-debrief-in-memory] writeCleanupDebrief removed. Cleanup status belongs in cleanup.log only — never injected into memory as a Quirk entry.

- [gap-analysis-no-changelog] Gap analysis prompt forbids changelog/past-event suggestions. The LM must not suggest entries phrased as "last cleanup did X" or "removed Y yesterday".

- [open-source-license] Project is licensed under GPL-3.0-only. MIT removed. Both root LICENSE and extension/LICENSE hold the GPL v3 text. Both package.json files have "license": "GPL-3.0-only".

- [docs-site-zensical] Docs site uses Zensical (pip install zensical). Config in zensical.toml at repo root. Serve: .venv/Scripts/zensical.exe serve. Build: zensical build → site/. Deploys to GitHub Pages via .github/workflows/docs.yml on push to main.

- [globalstate-keys-file] All globalState keys live in extension/src/globalStateKeys.ts as named exports. Never use bare string literals for globalState keys elsewhere.

- [category-limits-source] CATEGORY_LIMITS constant removed from markdownStore.ts. Category limits come from VS Code config only (package.json defaults via config.get). Default fallback is hardcoded as 20 in utils.ts.

- [adr-location] ADRs live in docs/decisions.md but are NOT in the Zensical nav. The nav has an ADR page (docs/adr.md) instead. That page links back to docs/decisions.md on GitHub.

- [category-limits-defaults] Category defaults doubled: Instruction/Security = 30, Quirk/Preference/Decision = 40. Schema maximum raised to 100. Fallback in utils.ts and UI validation cap updated to match.
