# Quirk

Memories stored by HackLM Memory.

- [template-literal-backtick-escape] Backticks inside getCopilotInstructionsSection() template literal must be escaped as \` or esbuild will terminate the string early and fail to build.

- [tree-item-id] [[tree-item-id-uniqueness]] Every TreeItem must have a stable unique id set explicitly. Without it, VS Code cannot preserve reveal state or selection across refreshes.

- [last-cleanup] Last cleanup: pruned 5 low-scoring entries
