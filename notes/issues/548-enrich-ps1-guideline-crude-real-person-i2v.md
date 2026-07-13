# Enrich the indie-ps1-ps2-horror guideline with the crude-real-person + i2v-hold tricks

> **Status:** todo
> **Filed:** 2026-07-13
> **Folder:** issues
> **Severity:** low
> **Category:** guidelines / craft-as-data

## Context

The `/dev-issues` memory pass consolidated two validated crude-PS1 lessons
(from `silent-hill` + `trafalgar` jjk-walk) into a new global memory entry
`ps1-crude-real-person-i2v` and retired the `silent-hill` copy. The permanent
practice home for this register already exists — `guidelines/indie-ps1-ps2-horror/`
(Register A = crude PS1). That guideline covers crude-vs-clean and identity
multi-ref, but does NOT yet carry the two specific tricks the memory captures.

## What

Fold two tricks into `guidelines/indie-ps1-ps2-horror/guideline.md` (and the
`.json` if it enumerates techniques):

1. **Real person → crude PS1:** pass an actual "Low Poly Shorts"-style video
   FRAME as a STYLE `--ref` alongside the identity photo `--ref` (gemini
   multi-ref); prompt a baked/dithered painted PS1 face TEXTURE on a low-poly
   head, normal body proportions. Ban prompt-only "crude PS1" (yields a smooth
   uncanny photo-on-mesh / Mortal-Kombat digitize), bobblehead heads, and
   post-process `image crunch`.
2. **Holding crude through i2v:** an anchor built from clean volumetric masters
   drifts realistic through seedance i2v — regen the anchor through a
   crude-pass first (Image1 = own anchor for composition, Image2 = a passed
   crude anchor for face crudeness), THEN i2v. The crude-pass also bakes the
   frame grit that clears the seedance privacy scan (see #547).

## Why it matters

The guideline is the register's permanent, `@guideline:`-triggerable home;
these two tricks are the difference between "crude PS1" and "uncanny digitized
photo," and were expensive to learn across silent-hill/trafalgar.

## Scope / acceptance

- Register A section of `guidelines/indie-ps1-ps2-horror/guideline.md` gains
  both tricks with the ban-list and the DOES-NOT-apply carve-out (clean
  volumetric register = no crude pass; no box-face hack — bake grit).
- Cross-link memory `ps1-crude-real-person-i2v` and `ps1-volumetric-3d-not-pixel-art`.
- `ralphy guideline show indie-ps1-ps2-horror` still loads; guidelines invariant
  test stays green.

## Notes

- Depends on #547 for the shared privacy-scan cross-reference.
- Keep it an ENRICHMENT — do not create a new guideline slug.
