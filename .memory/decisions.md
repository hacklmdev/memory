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

- [category-limits-rationale] Instruction=15, Decision=20, others unchanged. Instructions and Decisions grow fastest on active projects. Context length is not the constraint — quality is.


- [model-resolution] Model resolution always happens inside lm.ts. Callers pass a family string or nothing. They never call vscode.lm.selectChatModels directly. This keeps fallback logic in one place.
