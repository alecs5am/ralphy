# Intake: default-pick rules

> Moved out of `SKILL.md` to keep the skill body small (#574). Read on demand.

## Default-pick rules (04.03.02)

When a user request is concrete but doesn't specify a parameter, **pick the default and announce it**, never confirm:

| Missing | Default | Where it comes from |
|---|---|---|
| Format / template | Match to the brief's media format + *kind* of content and load the matching general/style template; if none fits, go freeform. Not a question — announce the match ("This is an unboxing video — using the unboxing template"). | format / template match (this section) |
| Craft overlay | If a content-niche craft skill (`/ugc-unboxing`, `/poster`, …) covers the brief, load it on top of the template match as a supplement. Announce it; not a question. | format / template match (this section) |
| Remix template | **Never a cold-start default and never auto-suggested.** A specific style template enters as a reproduction target only on an explicit remix pointer (`@template:<slug>`, "remix this one", named slug). | Remix path (this section) |
| Persona | The matched brand's `default_persona` if set; otherwise the closest archetype from `docs/creative-library/personas/ARCHETYPES.md` | `ralphy brand show <id>` → `persona` field |
| Duration | 15s | Intake step 6 default |
| Aspect | 9:16 UNLESS the matched niche skill sets its own default (e.g. toon-action → 16:9, broadcast-realism → 1:1) OR the user explicitly remixes a template that hard-codes one | Intake step 3 |
| Audio pipeline | Kling `--audio` if target language is EN AND the niche calls for lipsync; ElevenLabs post-mix VO+music for non-EN or faceless; ambient/SFX-only for stylized action | Intake step 2 |
| Music | Instrumental, ElevenLabs Music post-mix (Kling music disabled by default, per AGENTS invariant + venom-bodywash postmortem) | Intake step 7 + art-director playbook |
| Output language | **Always ask** — chat language ≠ video language (noski-people-001 trip-wire). | Intake step 1 |

Announce the pick once, then move on. **Do not** ask "shall I use 15s?" — say "Going 15s, 9:16, instrumental music — flag any of those if wrong."
