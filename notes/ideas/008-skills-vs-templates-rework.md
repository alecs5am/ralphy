# Skills vs. templates rework — phased plan

> **Status:** SUPERSEDED by #052 (everything-is-a-template format taxonomy) + #053 (de-prefix skills, technical-only scope). The "niche content skills are the default route" model below is reversed: templates organized by format are now the content unit, and content-niche skills became de-prefixed craft overlays pending templatization in #058. Kept for history.
> **Filed:** 2026-05-27
> **Folder:** ideas

## Context

Templates were being over-recommended. The agent answered "make a video like X" by running `ralphy template suggest` and steering the user into the closest pre-made template. A template is a recipe for ONE specific video (one subject, one script, one cast) — forcing every brief into that mold produced off-brand, samey output. Surfaced in conversation 2026-05-27.

## The model (decided)

Two clean concepts, two jobs — full write-up in [`docs/skills-vs-templates.md`](../../docs/skills-vs-templates.md):

- **Skill** = generalized niche know-how ("how to make a *kind* of video", e.g. `/ugc-unboxing`). A domain overlay on the standard pipeline. The default route for a generic brief. Lives in `.agents/skills/ralphy-ugc-*`.
- **Remix template** = one concrete reproducible video. User-initiated only: the user points at a specific video (`@template:<slug>`, "remix this one") and states a swap ("same video, replace Stallone with SpongeBob"). Never auto-suggested. No new CLI verb — it is the existing `ralphy template use <slug>` driven by an explicit pointer.

## Phases

### Phase 1 — concept + system prompts (LANDED 2026-05-27)

- `docs/skills-vs-templates.md` — the source-of-truth concept doc.
- `AGENTS.md` invariant #10 rewritten; routing table gained a niche-skill row + a remix row.
- Playbooks de-template-ified: `meta.md` Rule 3, `intake.md` (cold-start niche-skill match + remix path + default-pick table), `scenarist.md`, `art-director.md`, `producer.md` + `producer/orchestration.md`, `docs/use-cases.md` section A + F3.
- Seeded the canonical niche skill `.agents/skills/ugc-unboxing/SKILL.md` (+ `.claude/skills` symlink).

### Phase 2 — niche-skill library build-out (PARTIAL, 2026-05-27)

Promoted from `notes/skills/` into live `.agents/skills/ralphy-ugc-*` (+ `.claude` symlinks), each fully adapted to our stack (OpenRouter + ElevenLabs only, all via `ralphy generate`/`ralphy render`, model ids from MODELS.md) and our memory rules:

- `ugc-unboxing` (authored fresh, phase 1).
- `ugc-ad` ← `ugc-ad-production`. Ported: shooting-script columns, mannerisms=trust, problem-mirror hook, reverb/room-presence, CTA urgency.
- `ugc-model-swap` ← `ugc-model-swap`. Ported the face-lock / prop-negative / continuous-scene / body-mechanics craft. **Corrected the model choice**: source said "always Seedance" — our memory says Seedance blocks photoreal humans, so photoreal swap → kling-v3.0-pro; stylized/cartoon swap → seedance. This is the craft behind the remix-with-swap pattern.
- `ugc-rockstar` ← `rockstar-agent`. Self-contained GTA-V style overlay, infra-neutralized (dropped Higgsfield/Runway/sub-files), original-homage guardrail.

**Deferred candidates** (in `notes/skills/`, NOT promoted — reasons):
- `flash-reel` — not a niche; it hardcodes one specific person's 5 ref CDN IDs + a "demon ball" concept. It's one video, not generalized know-how. Would need a full rewrite to generalize.
- `pulp-cinema-director`, `storyboard-cheatcode` — Higgsfield-MCP bound; need infra rewrite.
- `gpt-image-2-director`, `kling-3-prompt-director`, `seedance-prompting-…`, `cinematic-motion-language`, `b-roll-shot-planner` — prompt-CRAFT helpers, not niches. They overlap with the art-director playbook + the guidelines system, and several name wrong models (`imagegen_2_0`) or foreign IP characters. Better folded into guidelines than shipped as standalone agent skills.
- `static-ads`, `cod-ultimate-thumbnail`, `storyboard-generation`, `theme-factory` — adjacent (static images / slides / thumbnails), not UGC video.
- `ad-creative`, `copywriting`, `content-strategy`, `email-sequence`, `marketing-ideas`, `marketing-psychology`, `paid-ads`, `social-content`, `edit-article`, `writing-beats/-fragments/-shape`, `prompt-engineering-expert` — off-domain marketing/long-form-writing skills from a general marketplace download. Out of Ralphy's video scope; promoting them would pollute agent routing + the skill-discovery budget. Leave in notes.
- `humanizer` — already ships as an installed skill. Skip. `ab-test-setup` — zero-byte placeholder body.

**Open question (still open):** the 38 `vibe-style` templates overlap with niche skills. Migration decision (convert / keep both / deprecate) deferred until more niche skills exist. The user chose new `ralphy-ugc-*` over converting in phase 1.

**Discovery:** `ralphy skill list` could distinguish niche (`ralphy-ugc-*`) from operational skills — not done yet.

### Phase 3 — skills page marketplace redesign (LANDED 2026-05-27)

- `landing/lib/skills-loader.ts` — NEW build-time loader walking `.agents/skills/*/SKILL.md` (minimal frontmatter parser, no dep). Categories derived by prefix: UGC niches / Workflow / Render engine / Maintainer. Deleted the stale hand-maintained `skills-data.ts` (it referenced a non-existent `ralphy-remotion`).
- `landing/components/SkillsListing.tsx` — rewritten: grid of cards, category-tab filters with counts, search, tag chips, monogram avatars (no emojis, no borders — per memory).
- `landing/app/skills/[slug]/page.tsx` + `SkillFiles.tsx` — NEW detail route. File tree (left) + content (right); single-file skills hide the tree. Each file rendered server-side via MDXRemote and passed as a child panel to the client tree toggler (RSC interleaving). `Copy md` button. MDX sanitizer escapes bare `<placeholder>` angle brackets outside code so SKILL.md bodies compile.
- Builds clean: 25 skill detail pages prerendered.

### Phase 4 — library → remix collection (LANDED 2026-05-27)

- `landing/app/library/page.tsx` — reframed: hero leads with "the remix collection", explains the skill-vs-remix split + links to `/skills`. How-it-works rewritten around the tag + swap flow ("same video, but replace X with Y"). The existing build-time loader already merges `recreate-video` remixes + `image-prompt` guidelines; the `isRemix` detail branch + remix steps already existed (sharpened the swap phrasing).
- No CLI verb added (decided) — remix is the prompt-only `@template:<slug>` + swap pattern.

**Still TODO (not blocking):** the older `landing/app/templates/page.tsx` gallery still exists and overlaps the library remix surface — fold templates + showcase clips into one remix surface, or retire the templates page. Left as-is this session.

### Phase 3b — skill icon tiles (LANDED 2026-05-27)

Per-skill square pixel-art icon tiles, icon centered at a fixed size, background colour by category. Pipeline:
- `landing/scripts/gen-skill-icons.sh` — recipe (slug → icon subject) that calls `ralphy generate image` (gemini, OpenRouter) to draw each icon on a pure chroma-green screen. Needs OPENROUTER_API_KEY. Throwaway project `landing-skill-icons-001` (gitignored workspace). ~$0.15/icon.
- `landing/scripts/build-skill-icons.py` — Pillow: chroma-key the green → transparent (greenness threshold + despill), autocrop to bbox, NEAREST-rescale to a fixed box (keeps pixels crisp), composite centered onto a 512px tile of the category background hex, export webp. Category bg: UGC=#E7A6BC rose, Workflow=#9DBEF0 blue, Render=#84D6C4 teal, Maintainer=#EBC07E amber.
- Output: `landing/public/assets/skills/<slug>.webp` (25 tiles, ~0.2 MB total — committed). The 1024px green-screen sources (~18 MB) are NOT committed; webp is the in-repo source of truth.
- Wiring: `skills-loader.ts` sets `icon` when the webp exists (else null). `SkillsListing` card + `SkillDetailView` head render the `<img>` with monogram fallback. `image-rendering: pixelated` keeps them crisp.
- Lesson: don't `bun run build` while `next dev` is running — they share `.next` and the build clobbers the dev manifest (500s). Stop dev or use a separate build dir.

## Decisions locked (2026-05-27)

- Niche skills live in new `.agents/skills/ralphy-ugc-*` (same mechanism as existing skills).
- Remix needs **no** new CLI verb — prompt-level pattern over `ralphy template use`.
- Phase 1 (concept + prompts) first; phases 2-4 sequenced after.
