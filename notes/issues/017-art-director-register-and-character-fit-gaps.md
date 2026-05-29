# Art-director playbook missing "register" axis and character-fit rule

> **Status:** done — 2026-05-29
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** high
> **Category:** playbook

## Context

The art-director playbook covers composition modes (anchor → motion → captions) but doesn't surface the visual "register" dimension — still-photography vs TV-commercial vs broadcast-news vs illustration vs medical-radiograph. It also has no guidance on whether a clean brand mascot survives a gritty visual register. Both omissions cause expensive re-roll cycles.

## What

- `venom-bodywash-001`: wasted ~$3 + 5 iterations on TV-commercial register for photoreal humans before user pointed to `noski-people-001`'s still-photography register (Sony A7 IV + Sigma + Kodak Portra 400 + naturalistic-not-glossy).
- `ralphy-carousel-001`: forced clean ghost mascot into punk/acid register and had to redesign covers — clean mascot doesn't survive gritty register without distressed variant.
- `ralphy-vs-higgsfield-001`: shipped with three aesthetic registers across branches (Lesson #7 aesthetic-lock).
- `biofix-hypnic-en-001` related lesson (MEMORY: `feedback_biofix_cgi_specimen_not_xray`) — scrape-profile abstracts too much.

## Why it matters

Register is the single biggest visual-quality lever. The playbook treats it as a downstream prompt detail; it's actually the upstream pick that determines whether all subsequent prompts are useful.

## Suggested fix

- New `docs/playbooks/art-director/photoreal-humans.md` codifying the still-photography register stack: Sony A7 IV + Sigma 35/85mm + specific f-stop + Kodak Portra 400 + ambient single-source light + "hyperreal NOT glossy" + inline identity restating.
- New `docs/playbooks/art-director/character-fit.md` — clean mascot rarely survives gritty register; choices are (a) reinterpret in-medium, (b) build distressed variant, (c) shift register.
- Add "register" as the first axis in `prompt-style.md` with a pick-first checklist.
- Add aesthetic-lock checkpoint after hub-shot approval — refuse to fan out anchors until register is approved.
- Methodology rule: when in doubt about register, run `ralphy ref pull <one-canonical> → frames` and READ frames. Don't scrape-summarize.

## Sources

- `workspace/projects/venom-bodywash-001/postmortem/05-workflow-fixes.md` — #2, Finding C
- `workspace/projects/ralphy-carousel-001/postmortem/05-workflow-fixes.md` — #2
- `workspace/projects/ralphy-vs-higgsfield-001/postmortem/02-lessons.md` — Lesson #7
- MEMORY: `feedback_photoreal_still_register`, `feedback_biofix_cgi_specimen_not_xray`
