# `ralphy generate` overwrites slot files instead of versioning them

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** high
> **Category:** cli

## Context

AGENTS.md invariant #14 promises that regenerating a slot writes `.<slot>.v2.<ext>` (then v3, v4…) and never destroys the prior file unless `--force-overwrite` is passed. In practice the invariant is documented but not consistently enforced across `image | video | music | voiceover`. Multiple postmortems show in-place overwrite of slot artifacts and of `index.html` during HyperFrames editing.

## What

- `noski-people-001` recorded 15 image/video slot overwrites in a single session.
- `kbo-broadcast-001` lost a $0.70 5s clip to in-place overwrite.
- `odindoma-fb-ad-001` lost 9 intermediate `index.html` revisions before final cut — invariant text does not currently cover `index.html` / `compositions/*.html`.
- `venom-bodywash-001` lost v1 of `master-venom-product`; agents only avoid data loss by remembering `cp` first.
- `ralphy-carousel-001` reports auto-versioning DID work for `image`, suggesting coverage is partial.

## Why it matters

Postmortem reasoning across regen variants depends on the failed/older artifacts still being on disk. Silent overwrite makes the "compare v1 vs v3 to decide" loop impossible and contradicts the invariant text agents are routed to trust.

## Suggested fix

- Confirm `cli/lib/providers/media.ts` + `cli/lib/asset-manifest.ts` versioning is applied uniformly to `image | video | music | voiceover`. Add a smoke test per kind.
- Extend invariant #14 to explicitly cover `index.html` and `compositions/*.html` under `workspace/projects/<id>/`.
- New `cli/test/invariants/append-only.test.ts` to lock the behavior in CI (see issue 015).
- Update `asset-manifest.json` to track every version, not just the latest.

## Sources

- `workspace/projects/noski-people-001/postmortem/03-cli-issues.md` — 15 overwrites, finding C
- `workspace/projects/kbo-broadcast-001/postmortem/03-cli-issues.md` — $0.70 clip lost
- `workspace/projects/odindoma-fb-ad-001/postmortem/03-cli-issues.md` — `index.html` overwritten 10x
- `workspace/projects/venom-bodywash-001/postmortem/03-cli-issues.md` — v1 master product lost
- `workspace/projects/playdate-pixel-001/postmortem/03-cli-issues.md` — #1
- `workspace/projects/ralphy-carousel-001/postmortem/` — partial coverage data point
