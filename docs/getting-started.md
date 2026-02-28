# Getting Started

This guide takes about 5 minutes. By the end, Copilot will remember something you told it — even after you close VS Code.

---

## Step 1 — Install the extension

Open VS Code. Press `Ctrl+Shift+X` to open Extensions. Search for **HackLM Memory**. Click **Install**.

Or click one of these links:

- [Install from VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=hacklm.hacklm-memory)
- [Install from Open VSX](https://open-vsx.org/extension/hacklm/hacklm-memory)

> **Using an Open VSX-compatible editor?** The extension installs and sets up the `.memory/` files and `copilot-instructions.md` reference block in any editor. The `storeMemory` and `queryMemory` LM tools, tree view, and status bar require the VS Code LM Tool API and are only available in VS Code 1.99+. See the [compatibility table](../README.md#open-vsx-editors) for details.

---

## Step 2 — Open a project folder

HackLM Memory works per-project. Open any folder in VS Code (`File → Open Folder`).

The first time you open a folder after installing, you'll see a pop-up:

> **HackLM Memory** wants to add a memory pointer to your Copilot instructions. Allow?

Click **Allow**. This is a one-time step. The extension adds a small note to `.github/copilot-instructions.md` that tells Copilot *"hey, you have a memory notebook — here's how to use it."*

> Don't have a `.github/copilot-instructions.md`? The extension creates it for you.

---

## Step 3 — Talk to Copilot, confirm the save

Open a Copilot chat (`Ctrl+Alt+I`). Talk normally:

```
We use esbuild to bundle this project. The entry point is src/extension.ts.
```

Copilot decides this is worth keeping and shows you a confirmation:

> **Save to Memory — Decision**
> We use esbuild to bundle this project. The entry point is src/extension.ts.
> Store this memory?

Click **Save**. That's the only thing you need to do. The memory is written to `.memory/decisions.md` in your project folder. You'll see a brief **Memory saved** message in the status bar.

Open `.memory/decisions.md` — it's plain text. You can read and edit it directly.

> **Want it fully automatic?** Turn on **HackLM Memory: Auto Approve Store** in VS Code settings and the confirmation dialog disappears.

---

## Step 4 — Check that it works

Close the chat. Open a new one. Ask:

```
What bundler does this project use?
```

Copilot checks the notebook and answers: **esbuild**.

You can close VS Code entirely, come back tomorrow, and it will still know.

---

## The notebook: five sections

Your project has one notebook, split into five plain text files under `.memory/`:

| File | What to put here | Example |
|------|------------------|---------|
| `decisions.md` | Things you chose and why | *"We use PostgreSQL, not SQLite, because of concurrent writes"* |
| `preferences.md` | How you like things done | *"Always use named exports, never default exports"* |
| `instructions.md` | Rules Copilot must always follow | *"Never use `any` in TypeScript"* |
| `quirks.md` | Weird things about this project | *"The API returns 200 even on errors — check the body"* |
| `security.md` | Things that must never happen | *"Never log request bodies — they contain PII"* |

Copilot picks the right file — you just confirm the save when asked.

You can also open and edit these files directly in VS Code — they're just Markdown.

---

## Automatic gap analysis

Every third time you save a memory, HackLM Memory automatically reviews what you've stored and suggests anything that looks missing. You'll see a prompt in VS Code with the suggestions — you confirm each one before anything is saved.

You can also trigger a review manually at any time. Open the command palette (`Ctrl+Shift+P`) and run **HackLM Memory: Session Review**.

In a Copilot chat, you can also ask directly:

```
Review this session. What decisions did we make that are worth remembering?
```

Either way, nothing gets saved without your approval.

---

## You're done

You now have a Copilot that remembers your project. Keep coding. Every important decision you mention becomes part of the notebook.

---

## What's next?

- [API Reference](api-reference.md) — if you want to understand the exact commands (`storeMemory`, `queryMemory`)
- [Architecture](architecture.md) — if you want to know how it all works internally
- [Contributing](contributing.md) — if you want to improve the extension itself
