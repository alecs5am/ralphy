# Sora video prompts

OpenAI Sora prefers:

- **Short, physics-rich declarative sentences.**
- **"Camera-as-perspective" syntax** — `bodycam perspective`, `drone perspective`, `selfie perspective` — not `handheld camera shot`.
- **Tight noun-verb structure**, NOT comma-stacked attributes.

The adapter automatically rewrites common camera idioms into perspective phrasing.

### Hard rules

- **No bracketed dialogue.** Use `Voice (tone): "line".`
- **Avoid dense modifier stacks.** Each sentence does one job.

---

## Mode 1 — `pov-bodycam-walk`

**Sample prompt:**
> Bodycam perspective. A delivery courier in a yellow rain jacket walks fast down a wet city sidewalk. Late evening, neon shop signs reflected in puddles. Sodium streetlight overhead, cool blue rim from screen-left. Documentary realism, slight motion blur. Steady forward stride with side-to-side bob. Voice (urgent): "I'm almost there."

## Mode 2 — `aerial-drone-establishing`

**Sample prompt:**
> Drone perspective. A small fishing village wraps around a turquoise bay. Late morning, scattered cumulus cloud. Hard sun, soft sea-surface bounce. Cinematic aerial register. Slow forward push at 8m altitude. The drone glides smoothly over rooftops.

## Mode 3 — `selfie-monolog`

**Sample prompt:**
> Selfie perspective. Maya, 26, light brown skin freckled cheeks navy sweater. She looks straight into the lens and grins. Home kitchen, mid-morning. Soft window light from screen-right. Naturalistic film register. Slight handheld sway. Voice (deadpan): "I tried it for thirty days."

## Mode 4 — `first-person-pov-action`

**Sample prompt:**
> First-person POV perspective. The viewer's hands grip the handlebars of a vintage motorcycle. The bike accelerates down an empty desert highway. Late afternoon, hard sun overhead. Documentary GoPro register, slight chromatic aberration. Vibration in the handlebars; horizon tilts as the bike leans into a curve.

## Mode 5 — `dolly-cinematic-portrait`

**Sample prompt:**
> Dolly perspective. A weathered fisherman in his sixties stands on a quiet pier. The camera slowly dollies in from medium to close-up. Pre-dawn, overcast, ambient blue light. Documentary register, 35mm. He blinks once and exhales a long visible breath. Voice (low): "Forty years out there."
