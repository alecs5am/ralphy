---
name: normalize-skills
namespace: maintainer
description: >-
  Audit the health of every `.agents/skills/*/SKILL.md` and fill icon gaps on the landing skills marketplace. Two jobs: (1) AUDIT — for each skill folder, check that frontmatter parses, `name` is kebab-case (`/^[a-z][a-z0-9-]*$/`) and matches the folder, `description` is ≤1536 chars, `namespace` is `user` or `maintainer`, and a `.claude/skills/<slug>` symlink exists and resolves; report drift. Complements `lint:skills`, does not replace it. (2) ICONS — detect skills with no `landing/public/assets/skills/<slug>.webp`, give each a fitting pixel-art subject in `landing/scripts/gen-skill-icons.sh`, run generation for the missing slug(s) only, chroma-key + composite via `build-skill-icons.py`, verify the webp landed, then commit + push.
  USE WHEN the user types `/normalize-skills`, says "audit the skills", "check skill frontmatter", "which skills are missing an icon", "generate the missing skill icons", "fill the icon gaps", "fix skill drift", or after renaming/adding a skill that needs a marketplace tile.
  See body for ALSO FIRE / DO NOT FIRE / HARD INVARIANTS.
---

# normalize-skills — skill-health audit + landing icon backfill

This is a **maintainer** skill. It does not touch `workspace/projects/` for content work. It keeps the skill bundle internally consistent and the landing skills marketplace visually complete as skills are renamed or added.

Two layers it operates on:

- **The skill bundle** — `.agents/skills/<slug>/SKILL.md` plus the mirrored `.claude/skills/<slug>` symlinks (Claude Code reads the latter; they must point back at `../../.agents/skills/<slug>`).
- **The landing icon pipeline** — `landing/scripts/gen-skill-icons.sh` (green-screen pixel-art PNG via `ralphy generate image` into the throwaway project `landing-skill-icons-001`) → `landing/scripts/build-skill-icons.py` (chroma-key + composite) → the committed tile `landing/public/assets/skills/<slug>.webp`. The loader `landing/lib/skills-loader.ts` shows the webp when present, else a two-letter monogram.

Read `docs/skills-format.md` (frontmatter contract) and `docs/developing-ralphy.md` (English-only, append-only) before your first edit in a session.

## Trigger

Hard triggers (always act):
- User types `/normalize-skills`.
- "audit the skills" / "check skill frontmatter" / "fix skill drift".
- "which skills are missing an icon" / "generate the missing skill icons" / "fill the icon gaps".

### ALSO FIRE (proactively, offer — don't auto-execute)
- A new skill folder just landed under `.agents/skills/` with no matching `.claude/skills/<slug>` symlink → offer to create the symlink and generate its icon.
- A skill was renamed (folder + `name` changed) and its old webp is now orphaned / the new slug has no webp → offer the audit + backfill.

### DO NOT FIRE
- User is in **user mode** (making a video / operating the CLI). This skill is dev-only.
- User wants to author skill *content* (the body, triggers, workflow) — that is normal dev work against `.agents/skills/<slug>/SKILL.md`, not this audit.
- User wants to *regenerate an existing icon* whose webp is already committed — refuse unless they explicitly ask (append-only; see HARD INVARIANTS).

## HARD INVARIANTS

1. **Append-only on icons. Never regenerate a webp that already exists without an explicit ask.** The committed `landing/public/assets/skills/<slug>.webp` is the in-repo source of truth for that tile. The 1024px green-screen PNG sources are NOT committed and are throwaway. Generate only for slugs with NO committed webp. The default `git status` after a run is *N new untracked webps, zero modified*.
2. **English only on disk.** Every frontmatter field, slug, gen-script subject, and prose line lands in English (per `docs/developing-ralphy.md`). Gate before commit: `rg --pcre2 '\p{Cyrillic}' .agents/skills landing/scripts` must be empty.
3. **Generation needs `OPENROUTER_API_KEY`.** It is read from `.env` by the CLI. Each icon is ~$0.15 on `google/gemini-3-pro-image-preview` (default). Sum the count of missing slugs × $0.15 and surface the cost estimate to the user before running a paid pass.
4. **The audit never mutates `SKILL.md` content silently.** Report drift and propose the fix; only apply a frontmatter edit on explicit say-so. This skill complements `lint:skills` (which errors on frontmatter); it adds the symlink + icon dimensions that lint does not cover.
5. **Run gen per-slug for the missing slugs only** — `bash landing/scripts/gen-skill-icons.sh <slug>`. The build script `build-skill-icons.py` reprocesses every PNG in the source dir, so after building, revert any committed webp it rewrote and delete any stray output, leaving only the new tiles (see Workflow step 6).

## Workflow

### AUDIT — skill-health pass
1. **Enumerate skills.** `fd -t d -d 1 . .agents/skills` (or `ls .agents/skills/`). For each that contains a `SKILL.md`:
2. **Frontmatter checks** (mirror `scripts/lint-skills.ts`, then add the extras):
   - `name` present, kebab-case `/^[a-z][a-z0-9-]*$/`, equals the folder name.
   - `description` present, ≤ 1536 chars (move ALSO FIRE / DO NOT FIRE / HARD INVARIANTS into body sections if over).
   - `namespace`, if present, is `user` or `maintainer` (never invent a third value).
3. **Symlink check.** `.claude/skills/<slug>` exists, is a symlink, and resolves to `../../.agents/skills/<slug>`. Flag dangling symlinks (e.g. a renamed/removed skill whose `.claude/skills` entry now points at nothing).
4. **Run the real lint** alongside: `bun run lint:skills` (errors on frontmatter) — this skill reports, it does not replace the gate.
5. **Report drift** as a table: slug | frontmatter ok? | symlink ok? | has webp? Then stop and ask before mutating anything.

### ICONS — backfill missing tiles
6. **Find icon gaps.** For every skill slug, check `landing/public/assets/skills/<slug>.webp`. The set with no webp is the work list.
7. **Ensure each missing slug has a gen entry.** Open `landing/scripts/gen-skill-icons.sh`; if a slug is absent from `ITEMS`, add a line `"<slug>|<concrete single pixel-art subject>"` matching the existing style (one centered object: e.g. `kanban board with three columns`, `framed poster with a big bold letter`). Keep subjects English, concrete, single-object.
8. **Estimate + confirm cost.** `count × $0.15`. Surface it. Generation is paid — get a go-ahead.
9. **Generate per-slug** (missing only):
   ```bash
   for slug in <missing-slugs>; do bash landing/scripts/gen-skill-icons.sh "$slug"; done
   ```
   Each prints `ok: <slug>` or `FAIL: <slug>`. On FAIL (geo-block / safety filter / quota), STOP, report which slug + the error, keep what succeeded — do not blind-retry.
10. **Build the tiles.** `cd landing && python3 scripts/build-skill-icons.py` (needs Pillow; `pip install Pillow` if absent). It writes `<slug>.webp` for every PNG in the source dir.
11. **Reconcile to append-only** (step-5 invariant). The build rewrites existing webps and may emit stale-named tiles from old PNG sources:
    ```bash
    git checkout -- landing/public/assets/skills/   # restore committed tiles byte-for-byte
    rm -f landing/public/assets/skills/<stale>.webp # drop any output not in the missing set
    git status --short landing/public/assets/skills/ # MUST be only the N new untracked webps
    ```
12. **Verify.** Exactly N new `??` webps, zero ` M` modified. Visually inspect (read a Pillow contact sheet) — crisp pixel-art, correct category background, on-theme subject.
13. **Build the landing** to confirm the loader picks them up: `cd landing && bunx next build` → exit 0.
14. **Commit + push** (dev-release channel discipline — `origin` main per repo convention): stage the new webps + the `gen-skill-icons.sh` edits + any symlink fixes, run the Cyrillic gate, commit, push to `origin`.

## Cookbook

```bash
# Which skills have no committed icon?
for d in .agents/skills/*/; do s=$(basename "$d"); [ -f "$d/SKILL.md" ] || continue; \
  [ -f "landing/public/assets/skills/$s.webp" ] || echo "missing: $s"; done

# Dangling .claude/skills symlinks
for l in .claude/skills/*; do [ -e "$l" ] || echo "broken: $l"; done

# Add a missing slug to the gen script, then generate just that one
#   edit landing/scripts/gen-skill-icons.sh ITEMS: "myslug|single centered object"
bash landing/scripts/gen-skill-icons.sh myslug
cd landing && python3 scripts/build-skill-icons.py && cd ..
git checkout -- landing/public/assets/skills/   # keep the 25/N committed tiles unchanged
git status --short landing/public/assets/skills/

# Gates before commit
bun run lint:skills
rg --pcre2 '\p{Cyrillic}' .agents/skills landing/scripts   # must be empty
cd landing && bunx next build                               # exit 0
```

## Outputs

- A skill-health report: per-slug frontmatter / symlink / icon status, plus `lint:skills` result.
- N new `landing/public/assets/skills/<slug>.webp` tiles for the previously-iconless skills, with the 25 (or however many) pre-existing tiles byte-unchanged.
- New `slug|subject` rows in `landing/scripts/gen-skill-icons.sh` for any slug that lacked one.
- A clean `next build` and a commit pushed to `origin` (when the user asks to ship).

## Note on the two category classifiers

`build-skill-icons.py` picks the tile background colour from `category_for(slug)` (prefix-based: `dev-` → Maintainer, `ugc-` → UGC niches, render-engine list → Render engine, else Workflow). `skills-loader.ts` uses a richer `categoryFor` that also folds content-niche slugs (`poster`, `carousel`, `fb-creatives`, `analog-horror-psa`, `audio-explainer`) into "UGC niches". These two can disagree on the tile *background* for a content-niche skill (the Python defaults it to Workflow-blue). The tile still renders; if you want the background to match the loader category, align `category_for` in the Python script — but that re-tints existing tiles, so treat it as a deliberate, separately-confirmed change, not part of a routine backfill.
