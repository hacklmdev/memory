# Preference

Memories stored by HackLM Memory.

- [memory-writing-style] Memory entries use Hemingway style. Short sentences. No jargon. No filler.

- [no-emojis] No emojis in code.

- [command-category] VS Code commands use "category" + short "title" in package.json. Never prefix title with the extension name — the palette adds category automatically.

- [command-icons] Every contributed command gets an "icon" field in package.json. View toolbar buttons won't show without it.

- [config-target-scope] Personal settings (LM family, cleanup frequency) save to ConfigurationTarget.Global. Workspace-specific limits save to ConfigurationTarget.Workspace.

- [settings-scope-application] Use "scope": "application" for user-level extension settings (LM family, cleanup frequency, autoApprove). This persists per machine, not per workspace.

- [settings-markdown-description] Extension settings use markdownDescription, not description. Enables code backtick formatting in the Settings UI.

- [status-bar-item-id] Use createStatusBarItem(id, alignment, priority) overload. Always provide a stable string id — required since VS Code 1.57.

- [void-cast-fire-forget] Fire-and-forget promises in extension code use void-cast (void somePromise.then(...)). Avoids floating promise lint warnings and makes intent explicit.

- [dedup-thresholds] Similarity thresholds in dedup.ts are named constants: SKIP_THRESHOLD=0.8, UPDATE_THRESHOLD=0.6. Never inline them.

- [quickpick-preselect] When presenting a canPickMany QuickPick for user review, pre-select all items. User deselects to reject. Never present with nothing selected.

- [globalstate-prefix] All globalState keys are namespaced with the extension id prefix (hacklm-memory.*). Never use bare keys — they collide across extensions.

- [globalstate-cleanup-log-key] The cleanup log is stored under a namespaced globalState key, same as all other extension state. Never write it to a bare key or a separate file outside globalState.

- [globalstate-keys-enumerated] All globalState key names are defined as constants in a single file. Never scatter bare string keys across modules.

- [tree-item-context-value] Every TreeItem that supports commands sets a contextValue string. Without it, when-clause conditions in package.json menus cannot target that item type.

- [globalstate-keys] All globalState key constants live in one file. No module defines its own key inline. Import from the constants file or the key does not exist.

- [docs-site-local-serve] Run the docs site locally with .venv/Scripts/zensical.exe serve. Build the static output with zensical build. Output goes to site/. Never commit the site/ directory.

- [adr-link-to-adrs] The ADR page (docs/adr.md) links to docs/decisions.md for the full ADR list. Keep that link current when new ADRs are added.

- [node-protocol-imports] Use node: protocol for built-in imports (node:fs/promises, node:path). Never import bare 'fs/promises' or 'path'.

- [lm-model-resolution-centralized] Model selection and resolution happen only in lm.ts. No other module calls selectChatModels directly. Import the resolved model from lm.ts or do not use it.

