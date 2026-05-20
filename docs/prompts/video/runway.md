# Runway video prompts

Runway Gen-4 takes a structured prompt with three internal lanes:

- **Subject reference** — identity anchor (1+ refs).
- **Style reference** — aesthetic anchor (1+ refs).
- **Motion prose** — what happens, in natural language.

Runway also responds to an explicit "temporal consistency" reminder at the end — the adapter appends this automatically.

### Hard rules

- **Refs are routed by role.** Don't dump everything into one ref slot.
- **Short clips work best.** ≤8s, single subject focus.

---

## Mode 1 — `talking-head-locked`

**Sample prompt:**
> Subject: Alex, 32, dark brown hair beard navy hoodie. Action: speaks deliberately, occasional eyebrow raise. Setting: home office, late afternoon. Style: documentary realism, Sony FX3 register, soft window light from screen-left. Motion: micro-movements only, head stable. Dialogue (calm): "I had to rebuild it from scratch." Temporal consistency: identity locked across the clip.

## Mode 2 — `product-rotation`

**Sample prompt:**
> Subject: a brushed-aluminum smartwatch on a black silicone strap. Action: slowly rotates 360 degrees on a glass pedestal. Setting: studio cyc, matte black. Style: hyper-commercial CGI register, hard rim light + soft fill, color graded teal/orange. Motion: smooth continuous rotation, no jitter. Temporal consistency: identity locked across the clip.

## Mode 3 — `pov-action`

**Sample prompt:**
> Subject: POV — hands gripping handlebars of a mountain bike. Action: descends a forest trail, branches whip past the camera. Setting: dense pine forest, dappled afternoon light. Style: GoPro Hero-12 register, slight fish-eye, ambient natural lighting. Motion: aggressive handheld bob, leaning into corners. Temporal consistency: identity locked across the clip.

## Mode 4 — `cinematic-two-shot`

**Sample prompt:**
> Subject: two characters at a diner booth — Anna (40s, red coat) and Joel (50s, gray suit). Action: Anna leans forward, Joel sits back arms crossed. Setting: 1970s American diner, late evening. Style: cinematic 35mm anamorphic, mixed tungsten/neon practicals. Motion: subtle, conversational, no dolly. Dialogue (Anna, urgent): "It's already too late." Temporal consistency: identity locked across the clip.

## Mode 5 — `motion-graphic-overlay`

**Sample prompt:**
> Subject: a glowing geometric logo (clean vector hexagon, neon-cyan stroke). Action: appears mid-frame, pulses once, particles dissipate outward. Setting: deep matte-black void. Style: motion-graphic flat 2D register, vector-perfect edges. Motion: 1.5s build-in, 0.5s pulse, 1s dissolve. Temporal consistency: identity locked across the clip.
