# Mine local agent memories into the public repo

> **Status:** done — 2026-06-14 (full 86-entry coverage matrix in notes/research/; 14 PORTed to MODELS.md + 3 new guidelines + playbook/skill notes; 12 niche rules deferred to the #058 niche-skill templatization)
> **Filed:** 2026-05-30
> **Folder:** issues
> **Severity:** low-medium
> **Category:** docs / guidelines

## Context

The agent's local memory (`~/.claude/projects/-Users-maximovchinnikov-github-ugc-cli/memory/`)
holds ~30 battle-tested rules — anti-AI-slop, photoreal-still-register,
Kling-no-RU-audio, ElevenLabs-no-artist-names, broadcast=square, deliberate-prop
VFX, frame-break hook, i2v provider filters, image-safety thresholds, sticker
flood-fill cutout, etc. Some are not reflected in the public repo, so a fresh
clone / other user never benefits.

## What

Audit each memory entry against the public repo (`guidelines/`, `MODELS.md`,
`docs/playbooks/`, skill bodies) and port the genuinely useful, not-yet-public
craft knowledge into the right public artifact.

## Scope / acceptance

1. Build a coverage matrix: memory entry → already-public? → if not, target file.
2. Port the gaps:
   - Model failure modes / picks → `MODELS.md` + relevant guideline.
   - Prompt craft (anti-slop, photoreal, deliberate-prop, broadcast=square) →
     `guidelines/<slug>/`.
   - Provider filters / geo-block / parallelism facts → `MODELS.md` failure-modes.
   - Composition rules (multi-scene gating, frame-break, sticker cutout) →
     `docs/playbooks/` or the matching skill body.
3. **English-only on disk**; paraphrase, don't paste. Each entry gets the
   guideline "Does NOT apply to:" negative-scope line (global CLAUDE.md rule).
4. Do NOT port machine-specific / personal entries (git remotes, deploy creds,
   desktop-app billing, user profile) — those stay local.

## Why it matters

The public Ralphy should encode the hard-won lessons, not depend on one machine's
private memory. Closes the gap between what the agent knows and what ships.

## Notes

- Independent of the other issues; low collision. Can run any time.
- Cross-reference `045-memory-entries-over-applied-no-scope` (scope discipline).
