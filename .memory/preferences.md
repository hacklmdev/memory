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
