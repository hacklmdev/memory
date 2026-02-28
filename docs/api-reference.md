# API Reference

## LM Tools

HackLM Memory registers two tools with the VS Code Language Model Tool API. Copilot calls them automatically during chat sessions when it decides to read or write memory.

---

### `storeMemory`

**Tool reference name:** `storeMemory`  
**Display name:** Store Memory

Saves a durable insight about the current project for future sessions.

#### Input Schema

```json
{
  "type": "object",
  "required": ["category", "content"],
  "properties": {
    "category": {
      "type": "string",
      "enum": ["Instruction", "Quirk", "Preference", "Decision", "Security"],
      "description": "The memory category"
    },
    "content": {
      "type": "string",
      "description": "The insight to store. One concise sentence."
    },
    "slug": {
      "type": "string",
      "description": "Optional kebab-case key (e.g. 'console-logs'). Same slug = update, not duplicate."
    }
  }
}
```

#### Behaviour

1. Runs a Jaccard similarity check against existing entries in the same category.
   - Similarity ≥ 0.8 → skip (too similar to an existing entry).
   - Similarity ≥ 0.6 → update the most similar existing entry.
   - Similarity < 0.6 → proceed to write.
2. For slug-less entries above step 1's threshold, runs an optional LLM redundancy check as a second pass.
3. If a `slug` is provided, upserts the entry with that slug (overwrites existing entry with the same slug).
4. Shows a confirmation prompt (unless `hacklm-memory.autoApproveStore` is `true`).
5. Appends or upserts the entry to `.memory/<category-file>.md`.
6. Triggers gap analysis every 3rd successful store.

#### Output

Returns a plain text string:

- `"Stored."` — entry was saved.
- `"Skipped (duplicate)."` — entry was too similar to an existing one.
- `"Updated [slug]."` — existing entry was updated.
- `"Cancelled."` — user declined the confirmation prompt.
- Error message string on failure.

---

### `queryMemory`

**Tool reference name:** `queryMemory`  
**Display name:** Query Memory

Searches stored memories and returns the most relevant results.

#### Input Schema

```json
{
  "type": "object",
  "required": ["query"],
  "properties": {
    "query": {
      "type": "string",
      "description": "Search query — keywords or a natural language question"
    },
    "category": {
      "type": "string",
      "enum": ["Instruction", "Quirk", "Preference", "Decision", "Security"],
      "description": "Optional: filter to a specific category"
    },
    "limit": {
      "type": "number",
      "description": "Max results to return (default: 10, max: 20)"
    }
  }
}
```

#### Behaviour

1. Reads all entries from all `.memory/*.md` files (or the specified category file).
2. Runs keyword search: splits query into tokens, scores each entry by keyword hit count + exact phrase bonus.
3. Returns results ranked by score.

#### Output

Returns a formatted string of results, one per line:

```
[Decision] Use mutex before every file write
[Quirk] Backticks in template literals must be escaped as \` or esbuild will fail
[Preference] No emojis in code
```

Returns `"No memories found."` if no entries match.

---

## Memory Categories

| Category | File | Default Limit | What It Stores |
|----------|------|---------------|----------------|
| `Instruction` | `.memory/instructions.md` | 30 | How Copilot should behave |
| `Quirk` | `.memory/quirks.md` | 40 | Project-specific weirdness — non-obvious gotchas |
| `Preference` | `.memory/preferences.md` | 40 | Style, tone, and design choices |
| `Decision` | `.memory/decisions.md` | 40 | Architectural commitments |
| `Security` | `.memory/security.md` | 30 | Rules that must never be broken |

Limits are configurable per-category via `hacklm-memory.categoryLimit.<Category>` settings.

---

## `.memory/*.md` File Format

This is the **editor-agnostic contract**. Any future implementation (JetBrains, Neovim, etc.) must read and write this format.

### Structure

Each file is a Markdown document. Memory entries are top-level bullet list items:

```markdown
- [slug] Content of the memory entry. One sentence.
- [another-slug] Another memory entry.
- Entry without a slug.
```

#### Rules

- One entry per line.
- Each line starts with `- ` (hyphen + space).
- The optional slug is a kebab-case string wrapped in square brackets: `[slug-name]`.
- Slug characters: lowercase letters, digits, hyphens only. No spaces.
- Content follows the slug (or the `- ` prefix if no slug) on the same line.
- No markdown formatting inside entries (no nested bullets, no headers, no code blocks).
- Blank lines between entries are permitted but not required.
- Lines not matching the bullet pattern are ignored by the parser.

#### Example

```markdown
- [use-mutex] Use withFileLock() before every markdownStore write.
- [no-emojis] No emojis in code.
- Entry stored before slugs were introduced.
```

#### Upsert by Slug

When a `storeMemory` call provides a slug that already exists in the file, the existing line is replaced in-place. The line number changes only if entries are added/removed before it.
