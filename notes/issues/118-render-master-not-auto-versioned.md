# `ralphy render` archives `final-social.mp4` but overwrites the master `final.mp4`

**Found:** 2026-06-11, sotaocr-ref3-001 (second render of the same project).

## Symptom

Re-running `ralphy render <id>` on a project that already has a render:

```
ralphy: existing asset auto-archived → render/final-social.v1.mp4 (pass --force-overwrite to disable)
```

Only ONE archive line is printed. Afterwards `render/` contains `final.mp4` (new), `final-social.mp4` (new), `final-social.v1.mp4` (old social) — the previous MASTER `final.mp4` is gone, silently overwritten.

## Expected

AGENTS.md invariant #14 (append-only on generations) covers `render/`: both outputs must auto-version. Expected `final.v1.mp4` next to `final-social.v1.mp4`.

## Likely location

The auto-archive helper is applied to the social-encode output path but not to the hyperframes master output (`cli/commands/render.ts` / `cli/lib/render/hyperframes.ts` — the master is written by the hyperframes CLI subprocess directly to `--output render/final.mp4`, bypassing the versioning wrapper).

## Acceptance

- Re-render with an existing `final.mp4` → old master lands at `final.v{N}.mp4`, log line printed, social behavior unchanged.
- `--force-overwrite` disables both archives symmetrically.
- Covered by a case in `tests/unit/auto-version-invariant.test.ts` (render kind).
