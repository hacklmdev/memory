# Quirk

Memories stored by HackLM Memory.

- [template-literal-backtick-escape] Backticks inside getCopilotInstructionsSection() template literal must be escaped as \` or esbuild will terminate the string early and fail to build.

- [last-session-debrief] Codebase cleanup pass: removed 4 "explains what" comments from markdownStore.ts, queryMemory.ts, and cleanupMemory.ts; all other files were already clean.
