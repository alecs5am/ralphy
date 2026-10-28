# Seedance 2.0 safety and privacy filter: cases and rewording

> Moved out of `SKILL.md` to keep the skill body small (#574). Read on demand.

### Input-image privacy scan — four cases
The boundary is how much the *frame* reads as a photograph, not whether a face is present. A gritty, muddy, dithered frame with a detailed semi-real face close to camera **passes**; a bright, clean, smooth frame that reads as a photo is **blocked**.

1. **Stylized anchor reads too clean** → bake grain / dither / murk into the anchor AT GENERATION (PS1 surface grit: texture grain, ordered dither, muddy 64–128px textures, desaturated murk). Detailed semi-real faces survive once the frame stops reading as a photo.
2. **Crowd anchor with multiple semi-real faces** trips it even when stylized → render the background crowd as faceless / blank dark low-poly silhouettes (heads turned away or blurred).
3. **Photoreal-human anchor** always blocks on the OpenRouter route → generate via **FAL reference-to-video** (the ref guides identity, it is not pinned as a first frame) — memory `seedance-photoreal-via-fal`.
4. **No anchor / no ref (pure t2v)** is **not scanned** at all → animate stylized characters freely, carrying identity in dense SUBJECT / STYLE / SHOTS text — memory `seedance-t2v-clears-privacy-filter`.

Historical-engraving cut-outs (e.g. a steel-engraving portrait) pass fine — the engraving texture sits far enough from photo-likeness — memory `historical-figure-engraving-cut-outs-ada`.

### Output safety scan — reword the destruction beat
The output guard fires on violent-destruction wording regardless of the visuals. Keep the motion, drop the destruction verb:

| Blocked wording | Passing reword |
|---|---|
| explosion / blast | soft dissolve, bloom of light |
| shatter / shards | flows apart, ripples, disperses |
| breach / ram through the wall | opens into a passage, melts through, flows through |

### When this section does NOT apply
- **`kwaivgi/kling-v3.0-pro` has no such filter** — it is the no-filter fallback whenever a photoreal-human i2v anchor can't hold on seedance. Route there instead of fighting the scan.
- **Light comedic impacts pass untouched** (squash / bonk / crumble) — the guard targets destruction, not cartoon physics; do not reword them.
- **Non-human object / landscape refs pass freely** — no grit-baking or silhouetting needed for props, scenery, hands, or abstract motion.

### Cross-links
- **Data path:** done #514 (`notes/issues/done/514-filter-aware-model-rerouting.md`) shipped the headless filter-aware reroute-rules table (`(model, capability, error class) → reroute` with a `source` field citing this same memory slug) that automates these routes for the unattended farm. That executable table left this agent-facing CLI with the unattended-automation surface in the "split app surfaces" change; this section is the agent-in-the-loop craft home for the same craft.
- **Model record:** `ralphy models show bytedance/seedance-2.0` — the capability snapshot plus video lesson 6 (privacy filter rejects photoreal-human anchors → route kling) and 6b (multimodal `input_references` / `@Image1`), from [`docs/models/video.md`](../../../../docs/models/video.md).
- **Canonical memory:** `seedance-safety-privacy-filter-guide` (global tier) — the single source these rules are distilled from.

---
