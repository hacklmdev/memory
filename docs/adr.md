# Architecture Decision Records

These are the values that shape every decision in HackLM Memory. When you're unsure how to approach a design problem, start here.

---

## 1. Fail open

If the LM is unavailable, times out, or returns nothing — degrade gracefully. Never crash, never block the user. Every LM call returns `string | null`; callers treat `null` as "proceed without LM assistance."

This applies to model resolution, redundancy checks, gap analysis, and session review. The extension must remain fully functional as a store-and-retrieve tool even if Copilot is unreachable.

---

## 2. No false guarantees

Don't instruct the agent to do things it cannot reliably do. An early design had a "session debrief" rule requiring the agent to call `storeMemory` at the end of every turn. Turns end abruptly. The agent can't honour that. The rule was removed.

If a behaviour can't be enforced, don't document it as a requirement. Use `sessionReview` and gap analysis to surface uncaptured decisions instead — they prompt, they don't mandate.

---

## 3. One place for each concern

- All LM calls go through `lm.ts`. Nowhere else.
- All memory file I/O goes through `markdownStore.ts`. Nowhere else.
- One output channel singleton. One status bar item. One tree view provider.

This makes the codebase predictable. When LM behaviour changes, you edit one file. When the file format changes, you edit one file. Scattered implementations of the same concern are a maintenance tax.

---

## 4. Editor-agnostic storage

The `.memory/*.md` file format is the stable contract — not VS Code, not TypeScript, not this extension. A future JetBrains plugin or Neovim integration must read and write the same format for memory to be shareable across editors.

The storage layer (`dedup.ts`, `scoring.ts`, `search.ts`, `markdownStore.ts`) has no VS Code dependency and must stay that way.

---

## 5. Local-only, user-owned

No cloud sync. No telemetry. No background network calls. Memory lives in `.memory/` inside the workspace — plain text, diffable, gitignore-able. Users can read, edit, or delete any entry directly in their editor.

Extensions that silently exfiltrate data erode trust. This one doesn't.

---

## 6. Reference, don't inject

Rather than dumping the full memory store into `copilot-instructions.md` on every activation, the extension injects a reference table pointing the agent to specific `.memory/*.md` files. The agent fetches only what it needs for a given query.

This keeps `copilot-instructions.md` small regardless of how much memory accumulates, and avoids polluting every chat turn with irrelevant context.

---

## 7. Explicit over implicit

The extension asks before it acts:
- A consent toast before writing to `copilot-instructions.md`
- A confirmation prompt before storing a memory (unless `autoApproveStore` is enabled)
- Session review *prompts* — it never silently stores suggestions

Users should never be surprised by what the extension wrote on their behalf.

---

## Decision records

These principles are backed by concrete decisions documented as ADRs. For the full context — alternatives considered, consequences accepted — see [`docs/decisions.md`](decisions.md) in the repository.
