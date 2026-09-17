# Papername agent guidance

## Agent skills

### Issue tracker

Work is tracked locally in Markdown for this solo project; do not create or mutate external GitHub issues unless explicitly requested. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the standard five-role triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses a single root `CONTEXT.md` and root-level ADRs. See `docs/agents/domain.md`.

## Development

- Use `pnpm` for dependency and script management.
- Test behavior at public seams: filename generation, settings normalization, and extension-visible popup state.
- Keep paper content out of application logs and persistent storage; the extension has no backend.
- Run `pnpm check` before committing.
