# Quirk

Memories stored by HackLM Memory.

- [template-literal-backtick-escape] Backticks inside getCopilotInstructionsSection() template literal must be escaped as \` or esbuild will terminate the string early and fail to build.

- [tree-item-id] Every TreeItem must have a stable unique id set explicitly. Without it, VS Code cannot preserve reveal state or selection across refreshes.
