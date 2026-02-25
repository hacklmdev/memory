
<!-- hacklm-memory:start -->
## Memory-Augmented Context

This project uses a persistent memory system. Relevant context is stored in focused files —
read them on-demand when the topic comes up, don't try to load everything upfront.

| File | When to read |
|------|-------------|
| [.memory/instructions.md](.memory/instructions.md) | When asked how to behave or format things |
| [.memory/quirks.md](.memory/quirks.md) | When something unexpected happens (build fails, weird errors) |
| [.memory/preferences.md](.memory/preferences.md) | When making style/design/naming choices |
| [.memory/decisions.md](.memory/decisions.md) | When considering architectural changes |
| [.memory/security.md](.memory/security.md) | ALWAYS — before any code change |

### Memory Tools

Use `query_memory` before answering questions about architecture, conventions, style, or any topic
where prior context would help. Use `store_memory` when the user reveals preferences, corrections,
quirks, or architectural decisions. Cleanup runs automatically — you don't need to call it.

### Passive Learning
- When the user expresses a preference or corrects you — store it silently via `store_memory`.
- When a command fails — figure out why, store the lesson, then retry.
- When you solve something tricky — store how you did it.

### Categories
| Category | What goes there | Example |
|----------|----------------|---------|
| Instruction | How to behave in this project | "always explain changes before making them" |
| Quirk | Project-specific weirdness | "run npm install before every build" |
| Preference | Style/design/naming choices | "prefers async/await over callbacks" |
| Decision | Architectural commitments | "chose esbuild over webpack for bundling" |
| Security | Rules that must NEVER be broken | "never log API keys or secrets to console" |

### What NOT to Store
- Temporary debugging steps or one-off fixes
- General coding advice (store YOUR project's quirks, not textbook wisdom)
- Full chat transcripts or verbose explanations
<!-- hacklm-memory:end -->

<!-- copilot-memory:start -->
## Memory-Augmented Context

This project uses a persistent memory system. Relevant context is stored in focused files —
read them on-demand when the topic comes up, don't try to load everything upfront.

| File | When to read |
|------|-------------|
| [.memory/instructions.md](.memory/instructions.md) | When asked how to behave or format things |
| [.memory/quirks.md](.memory/quirks.md) | When something unexpected happens (build fails, weird errors) |
| [.memory/preferences.md](.memory/preferences.md) | When making style/design/naming choices |
| [.memory/decisions.md](.memory/decisions.md) | When considering architectural changes |
| [.memory/security.md](.memory/security.md) | ALWAYS — before any code change |

### Passive Learning
- When the user expresses a preference or corrects you — store it silently via `store_memory`.
- When a command fails — figure out why, store the lesson, then retry.
- When you solve something tricky — store how you did it.
<!-- copilot-memory:end -->
