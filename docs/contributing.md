# Developer Contributing Guide

This is the deep-dive companion to the root [CONTRIBUTING.md](../CONTRIBUTING.md). It covers how to extend the extension itself.

## Adding a New Memory Category

A new category requires changes in five places:

### 1. `extension/src/storage/markdownStore.ts`

Add the category and its filename to `CATEGORY_FILES` and a default limit to `CATEGORY_LIMITS`:

```typescript
export const CATEGORY_FILES: Record<string, string> = {
  // ... existing entries
  'Example': 'examples.md',
};

export const CATEGORY_LIMITS: Record<string, number> = {
  // ... existing entries
  'Example': 20,
};
```

### 2. `extension/src/instructionFiles.ts`

Add the new file to the bootstrap list in `ensureMemoryFiles()` and add a row to the reference table in `getCopilotInstructionsSection()`.

### 3. `extension/package.json`

Add the category to the `enum` in the `storeMemory` and `queryMemory` tool `inputSchema`. Add a per-category limit config entry:

```json
"hacklm-memory.categoryLimit.Example": {
  "type": "number",
  "default": 20,
  "minimum": 1,
  "maximum": 50,
  "markdownDescription": "Max entries to keep in the `Example` category."
}
```

### 4. `extension/src/tools/storeMemory.ts`

Update the `modelDescription` in `package.json` and any prompt strings that enumerate categories.

### 5. `docs/api-reference.md`

Add the new category to the Memory Categories table.

---

## Adding a New LM Tool

1. Create `extension/src/tools/myTool.ts` implementing `vscode.LanguageModelTool<InputType>`.
2. Add the tool name constant to `extension/src/toolIds.ts`.
3. Register the tool in `extension.ts`:
   ```typescript
   vscode.lm.registerTool(TOOL_IDS.MY_TOOL, new MyTool(context))
   ```
4. Add the tool contribution to `extension/package.json` under `contributes.languageModelTools`.
5. Document the input schema and behaviour in `docs/api-reference.md`.

### LM call rules (mandatory)

- All LM calls go through `lm.ts`. Call `resolveModel()` + `sendLmRequest()`. Never call `vscode.lm.selectChatModels` or `sendRequest` directly.
- Always pass a `justification` string to `sendLmRequest`. It appears in the VS Code permission prompt. An empty string shows a blank reason to the user.
- Forward the `token` parameter from the tool's `invoke()` method to `sendLmRequest`. This lets users cancel long-running LM calls.

---

## Build Pipeline

The extension uses [esbuild](https://esbuild.github.io/) for bundling:

```bash
esbuild src/extension.ts --bundle --platform=node --format=cjs --outfile=dist/extension.js --external:vscode
```

- `--bundle` — all imports are inlined into a single file.
- `--platform=node` — targets Node.js (not the browser).
- `--external:vscode` — the `vscode` module is provided by the extension host at runtime; it must not be bundled.
- Output: `extension/dist/extension.js` — this is the file referenced by `"main"` in `package.json`.

**Important quirk**: backticks inside template literals in `instructionFiles.ts` must be escaped as `` \` ``. esbuild will terminate the string early and produce a broken bundle otherwise. See the `.memory/quirks.md` entry `template-literal-backtick-escape`.

---

## globalState Keys

All `globalState` key names are defined as named constants. Never scatter bare string keys across modules. The current keys:

| Constant | Key string | Used in |
|----------|-----------|---------|
| `FIRST_ACTIVATION_KEY` | `hacklm-memory.firstActivation` | `extension.ts` |
| `INSTRUCTION_CONSENT_KEY` | `hacklm-memory.instructionFileConsentShown` | `extension.ts` |

When adding a new key, define it as a `const` at the top of the relevant file and note it in this table.

---

## Test Approach

Tests live alongside the source in `extension/src/storage/*.test.ts`. The `storage/` layer has no VS Code runtime dependency — all functions are pure TypeScript and can be tested with [Vitest](https://vitest.dev/) directly.

```bash
cd extension
npm test        # vitest run (single pass)
npx vitest      # vitest watch mode
```

When adding new storage functions, add corresponding tests in the matching `.test.ts` file. Aim to cover:

- Happy path
- Boundary conditions (empty inputs, threshold edges)
- Category filter behaviour where applicable

Tools in `extension/src/tools/` depend on `vscode` and `markdownStore` and require a full extension test harness to test end-to-end. This is out of scope for the current test suite.

---

## Known Quirks

See `.memory/quirks.md` for the full list. The ones most relevant to contributors:

| Slug | Description |
|------|-------------|
| `template-literal-backtick-escape` | Backticks inside `getCopilotInstructionsSection()` template literals must be escaped as `` \` `` or esbuild builds a broken bundle. |
| `tree-item-id` | Every `TreeItem` must have a stable unique `id` set explicitly. Without it VS Code cannot preserve reveal state across refreshes. |
| `empty-justification` | Passing an empty options object to `sendRequest` suppresses the justification string in the VS Code permission prompt. Always pass a `justification`. |
