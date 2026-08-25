# Character fit per visual register

**Read this when:** a project pairs a clean / cute brand mascot (ghost, blob, friendly character) with a gritty visual register (punk, acid, halftone, xerox-zine, grunge, horror, distressed analog), OR any time the cover-first checkpoint surfaces a "clean asset pasted on a dirty world" tension. Also read this when running [`..`](../SKILL.md)'s aesthetic-lock checkpoint and the picked register sits far from the mascot's native medium.

## The rule (one line)

**A clean / cute brand mascot rarely survives a gritty register without redesign.** Pasting the polished asset into punk / acid / xerox / horror reads as "ad break dropped into the wrong world" — exactly the visual collapse the `feedback_meme_header_tiktok_format` MEMORY entry and the analog-horror aesthetic-lock fix on `ralphy-vs-higgsfield-001` both warned about. The viewer pattern-matches "advertisement" the moment the register breaks.

## Three options when fit is bad

When the cover-first checkpoint shows the mascot doesn't fit the picked register, you have three choices. Pick ONE before fanning out anchors — never paste the clean asset and hope.

### 1. Reinterpret in-medium (passable)

Render the mascot **through** the register's medium, not pasted on top of it. Examples:

- Clean ghost → **halftone-printed ghost** with offset misregistration and CMYK dot-matrix grain. The silhouette survives; the texture matches the page.
- Friendly blob → **xerox-photocopied blob** at 3rd-generation degradation: blown-out highlights, crushed shadows, copy-machine streaks, photocopy edge-bleed.
- Cute character → **acid-warped character**: chromatic-aberration RGB split, scan-line tear, melted-edge bloom.

**When this works:** the register's medium is reproducible as a *filter* over the mascot. Print / xerox / scan / VHS all qualify. **When it fails:** the register is a *world*, not a filter (e.g. liminal-spaces, body-horror, deliberate-prop VFX). Then pick option 2 or 3.

### 2. Build a distressed variant of the character (better)

Generate a **new character anchor** that is the mascot reinterpreted *in* the register's native style — not the same asset filtered, but a parallel design. Examples:

- Clean ghost mascot → **punk ghost variant**: same silhouette + same eye placement, but the design language is patches / safety pins / DIY sharpie / torn fabric. Generate as a separate master; pass via `--ref` on every gritty-register slide alongside the clean master on every clean-register slide.
- Friendly blob → **acid-zine blob variant**: dripping outline, hand-drawn wobble, three-color risograph palette.

This is what `ralphy-carousel-001` postmortem #2 prescribes: "build a dedicated distressed character variant — never paste the clean asset unchanged." It costs one extra anchor generation up front (~$0.05) and stops the entire downstream batch from drifting.

**Locked-ref discipline:** the distressed variant gets its own `--ref` URL in the manifest. The clean master and distressed master are siblings, not versions. Use the clean master for clean-register slides, the distressed master for gritty-register slides; never cross-pollinate.

### 3. Shift the register (sometimes the right answer)

If neither option 1 nor option 2 lands, the brief is asking for an impossible pairing. **Tell the user.** Examples of pairings that should bounce back to the scenarist:

- Cute pastel mascot + body-horror register → either the mascot has to change, or the register does. Don't ship the half-version.
- Premium luxury brand identity + gritty xerox-zine register → the brand identity will break. Negotiate which side wins.

This is the same refusal class as the quality gate ([`quality-gate.md`](./quality-gate.md)) — refuse, don't warn. Hand back to the scenarist with a one-line "register X and mascot Y don't compose; pick one to compromise" message.

## Decide at the cover-first checkpoint, not after the full set

This is the highest-leverage timing rule in this file. From `ralphy-carousel-001` postmortem #1:

> Generate **one cover per register / style**, surface to the user, wait for approval **before** fanning out the rest of the slides / scenes. Cover-first catches the punk-acid mascot mismatch with **one** $0.05 gen instead of N × $0.05 across the whole set.

In art-director playbook terms, the cover-first checkpoint = anchor #1 per register. If a project has two registers (clean + gritty), generate two covers (one per register) **before** scene-02 of either branch.

## Aesthetic-lock checkpoint (cross-link)

After the location-master-plate is approved AND the character master(s) are approved AND the register is picked, the agent writes a **one-line aesthetic-lock string** into `STORYBOARD.md`:

```
AESTHETIC LOCK: warm-liminal / empty internet-horror / oversized lonely rooms
CHARACTER FIT: clean ghost master (clean-register slides) + distressed punk variant (gritty-register slides)
```

This string is then prepended to the FIRST line of every subsequent image prompt — both branches, every register. Skipping the lock is the documented cause of `ralphy-vs-higgsfield-001`'s three-register shipping defect (Lesson #7) and the same defect class as `ralphy-carousel-001`'s clean-ghost-in-punk drift.

## Sources

- `.ralphy/workspaces/<ws>/projects/ralphy-carousel-001/postmortem/05-workflow-fixes.md` — #2 (mascot/character fit), Finding A (cover-first checkpoint)
- `.ralphy/workspaces/<ws>/projects/ralphy-vs-higgsfield-001/postmortem/02-lessons.md` — Lesson #7 (hold one aesthetic end-to-end)
- MEMORY: `feedback_meme_header_tiktok_format`, `feedback_deliberate_prop_vfx_old_spice` — adjacent register-vs-character collisions in already-shipped work
