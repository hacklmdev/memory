## Description

<!-- What does this PR do? Why? -->

## Changes

<!-- List the files/modules changed and why -->

| File | Change |
|------|--------|
| | |

## Testing

- [ ] `npm run build` passes
- [ ] `npm test` passes (all tests green)
- [ ] Manually tested in Extension Development Host

<!-- Describe what you tested and how -->

## Documentation

- [ ] No docs change needed
- [ ] Updated `docs/` for architecture / API changes
- [ ] Added or updated an ADR in `docs/decisions.md` for architectural decisions

## Memory

- [ ] No new architectural decisions made
- [ ] Stored new decisions / patterns to `.memory/decisions.md` (or relevant category)

## Checklist

- [ ] No new bare `globalState` string keys (used the constants file)
- [ ] No direct `vscode.lm` calls outside `lm.ts`
- [ ] `markdownDescription` used for any new settings (not `description`)
- [ ] Conventional commit message (`feat:`, `fix:`, `docs:`, `test:`, etc.)
