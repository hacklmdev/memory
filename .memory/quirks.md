# Quirk

Memories stored by HackLM Memory.

- [template-literal-backtick-escape] Backticks inside getCopilotInstructionsSection() template literal must be escaped as \` or esbuild will terminate the string early and fail to build.

- [tree-item-id] Every TreeItem must have a stable unique id set explicitly. Without it, VS Code cannot preserve reveal state or selection across refreshes.

- [empty-justification] Passing an empty options object to sendRequest suppresses the justification string in the VS Code permission prompt. The user sees a blank reason. Always pass a justification.

- [adr-location] ADRs live in docs/decisions.md (a single flat file, not a directory). No separate per-ADR files. Add new ADRs as new H2 sections at the bottom of that file.
