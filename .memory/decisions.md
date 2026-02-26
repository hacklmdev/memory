# Decision

Memories stored by HackLM Memory.

- [no-session-debrief] Removed last-session-debrief rule. Can't enforce turn-end tool calls. Rule created false contract.

- [tree-view-for-browsing] Use a TreeDataProvider + registered view for browsing memories. Quick Pick is a transient input widget, not a browsing surface.

- [output-channel-singleton] One shared OutputChannel per extension. Never call createOutputChannel() per operation. Use a lazy singleton in outputChannel.ts.

- [hide-internal-commands] Hide internal commands from Command Palette via "commandPalette": [{"when": "false"}] in package.json menus.

- [tree-view-collapsed-default] Tree views default to "visibility": "collapsed" in package.json. Prevents the view hijacking Explorer on first install.

- [views-welcome-required] Always add a viewsWelcome contribution for every registered tree view. It shows guidance when the tree is empty instead of a blank panel.

- [tree-context-menu-groups] Tree item context menus include both inline (for delete) and navigation group (for open/reveal) entries. Inline appears as icon buttons on hover; navigation group appears in the right-click menu.

- [lm-calls-centralized] All LM calls go through lm.ts (resolveModel + sendLmRequest). No inline selectChatModels or sendRequest anywhere else.

- [lm-justification-required] Every sendRequest call includes a justification string. It populates the VS Code permission prompt. Never pass an empty options object {}.

- [lm-cancellation-token] CancellationToken from tool invoke() is forwarded to sendLmRequest. Users can cancel long LM calls. Never discard the token with _token.

- [lm-timeout-cleanup] LM timeouts use clearTimeout after Promise.race resolves. Never leave a setTimeout handle dangling after the LM call completes.

- [lm-on-did-change-models] Subscribe to vscode.lm.onDidChangeChatModels in activate(). Refreshes the status bar when Copilot signs in or out mid-session.

- [gap-analysis-rate-limit] Gap analysis runs every 3rd successful storeMemory call (GAP_ANALYSIS_INTERVAL=3). Skipped if total memories < 5. Counter tracked in globalState under hacklm-memory.gapCounter.

- [session-review-architecture] sessionReview.ts drives programmatic storeMemory enforcement. It makes its own LM call after every Nth store. Extension controls when and what gets stored — model does not need to self-trigger.

- [gap-suggestion-ui] Gap suggestions shown as a canPickMany QuickPick, all pre-selected. User deselects to reject. autoApproveStore=true skips the prompt and stores all suggestions silently.
