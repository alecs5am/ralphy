# Intake: cold-start format / template match

> Moved out of `SKILL.md` to keep the skill body small (#574). Read on demand.

## Cold-start format / template match (04.04.01 + 04.04.03)

**Hard rule: on a generic brief, match the media format / template library first; load a content-niche craft skill on top only as a supplement.** Templates are the primary content route, organized by media format (`ralphy template suggest --help`); the niche skills (`ugc-*`, `poster`, `carousel`, …) are supplementary craft overlays pending conversion to templates in issue 058. The full model is in [`docs/skills-vs-templates.md`](../../../../docs/skills-vs-templates.md).

When the user's first utterance is a generic content request (no `@template:<slug>`, no "remix this", no slug named), do this BEFORE drafting a plan:

1. **Identify the format.** Read the brief for the media **format** and the *kind* of content: video (unboxing, talking-head rant, tier-list, before/after, day-in-the-life), poster, carousel, fb-creative, motion-design, etc. Match it to a format in the template library — `ralphy template suggest "<brief>" --format <f>` surfaces the general + style candidates.
2. **Branch:**
   - **A format / template matches** → reach for the matching general (and style) template; it encodes the beat structure, framing, model stack, and pitfalls. If a content-niche craft-overlay skill (`/ugc-unboxing`, `/poster`, …) covers the brief, load it on top as a supplement to enrich it. Continue intake; the template fills most stack defaults, the user fills the subject.
   - **Nothing matches** → enter **free-form mode**, jump to `.agents/skills/scenarist/SKILL.md` step "scenario-from-brief". Say once: "No template fits this one — drafting freeform from your brief." Then proceed without asking.
3. **Use `ralphy template suggest` to surface format candidates on cold start** — that is the cold-start move. (The remix path below is reserved for the user pointing at one specific made video to reproduce by slug.)

**Why this discipline:** The template library, organized by format, scales across subjects and reproduces specific videos through the same surface. A *general* template works for the user's coffee grinder, someone else's keyboard, any no-name product; a *style* template can also reproduce one concrete video on an explicit remix pointer. Steering a generic brief into a single hand-picked "closest" recipe was the old failure mode — e.g. "a video in the style of @voidstomper" should match the video format's general template (overlaid with the relevant niche craft skill), not silently pivot to `found-footage-mockumentary` just because that style template mentions "voidstomper lineage".
