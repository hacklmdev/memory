# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-02-28

### Added

- Two-tier write locking: cross-process advisory lockfile (`crossProcessLock.ts`) stacked over per-file in-process promise queue — prevents concurrent writes from multiple VS Code windows
- Plan agent patching: `patchPlanAgent()` injects `queryMemory` + `storeMemory` into the Copilot Chat Plan agent on every activation (idempotent)

### Changed

- Default category limits doubled: Instruction/Security 15→30, Quirk/Preference/Decision 20→40
- Configurable maximum raised from 50 to 100

## [1.0.0] - 2026-02-27

### Added

- `storeMemory` LM tool — Copilot can persist insights to `.memory/*.md` with upsert-by-slug support
- `queryMemory` LM tool — keyword search across all memory categories, ranked by relevance
- Five memory categories: Instruction, Quirk, Preference, Decision, Security
- Per-file mutex locks in `markdownStore.ts` to prevent concurrent read-modify-write races
- Two-tier deduplication: Jaccard similarity check at write time (thresholds 0.8 / 0.6) + optional LLM redundancy check
- Entry scoring system (`scoring.ts`) weighting category, brevity, and specificity
- Cleanup command — merges similar clusters (Jaccard ≥ 0.3), prunes lowest-scoring entries over per-category limits, assigns slugs to untagged entries
- Session review and gap analysis (`sessionReview.ts`) — LLM-driven detection of implied but uncaptured decisions
- Gap analysis triggers automatically every 3rd `storeMemory` call
- Memory tree view in Explorer sidebar, grouped by category, with context-menu delete
- Status bar item showing live memory count
- QuickPick control panel for browsing, deleting, running cleanup, and configuring settings
- One-time notification toast on first activation for `.github/copilot-instructions.md` management with opt-out
- `hacklm-memory.manageInstructionFile` setting to disable managed injection of memory references
- `hacklm-memory.autoApproveStore` setting to skip confirmation prompts
- `hacklm-memory.lmFamily` setting to configure which Copilot model family to use
- Per-category entry limit settings
- Getting Started walkthrough (5 steps)
- esbuild single-file bundle (`dist/extension.js`) — no webpack
- Publishes to VS Marketplace and Open VSX

[Unreleased]: https://github.com/hacklmdev/memory/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/hacklmdev/memory/releases/tag/v1.0.0
