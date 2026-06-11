# Use cases — what good looks like

Canonical user-utterance → expected-flow → expected-output triples. The skills and the chat itself should respond according to this table. If a user's request matches a row here, the flow is deterministic. If it doesn't, fall back to `producer playbook` with a clarifying question.

> **Definition of "good":** a finished mp4 at `<project>/render/final.mp4` (`<project>` = `.ralphy/workspaces/<ws>/projects/<id>`), or an explicit refusal with a concrete suggestion (not "I'll give it a shot"). Intermediate steps log to `generations.jsonl`.

User utterances below are shown in English.

---

## A. Cold-start niche videos

Format-first flow: the chat matches the brief to a media format / template (`ralphy template suggest "<brief>" --format <f>`; formats in `ralphy template suggest --help`), loads any matching content-niche craft-overlay skill (`ugc-*`, `poster`, …) on top as a supplement, and runs the normal pipeline. Templates are the primary content route; the niche craft skills are supplementary overlays pending conversion to templates in issue 058. A *style* template doubles as a remix target when the user points at one specific video to reproduce by slug. The slugs named below identify the niche; each also exists as a style template the user can remix by name. See [`docs/skills-vs-templates.md`](skills-vs-templates.md).

### A1. AI vegetables

**Utterance:**
- "make me an AI vegetables video about <topic>", "I want a vegetable video AI-style", "do AI vegetables for <X>"

**Expected first response:**
> AI-vegetables niche (viral POV, ~15s, ~$8). I'll build it from your topic. Starting.

**Flow:**
1. Match the video format / template (`ralphy template suggest "<brief>" --format video`), `ralphy project create --id <slug>-001 --name "<human>"`, and load the matching content-niche craft-overlay skill on top (or work freeform in the AI-vegetables niche). *Remix variant: if the user pointed at the `ai-vegetables` style template to reproduce → `ralphy template use ai-vegetables --project <slug>-001 --brief "<the swap>"`.*
2. `art-director playbook` → keyframe (gemini-3-pro-image-preview) → i2v (kling-v3.0-pro)
3. `editor playbook` → captions (whisper-1) → render
4. `ralphy render <id>` → mp4 path

**Target:** ≤8 min wall-time, ≤$8.

### A2. Talking-head rant

**Utterance:**
- "make a talking head about <X>", "monologue where a guy rants about <Y>", "deadpan rant about <Z>"

**Expected first response:**
> Talking-head-rant niche (15-20s, character + hook screenshot, ~$10). Which archetype — remote IT worker, courier/driver, stay-at-home creator? If you don't know, I'll pick.

**Flow:**
1. `ralphy persona suggest --archetype <inferred>` or the chat proposes a default.
2. Match the video format / template, `ralphy project create`, and load the talking-head craft-overlay skill on top (or freeform). *Remix variant: user named the `talking-head-rant` style template → `ralphy template use talking-head-rant`.*
3. `scenarist playbook` → 15-20s scenario with hook in the first 3s.
4. `art-director playbook` → character image → veo-3.1 talking-head.
5. `editor playbook` → captions + hook screenshot overlay → render.

**Target:** ≤10 min, ≤$12.

### A3. Before/after product

**Utterance:**
- "make an ad for <product>", "before-after for <tool>", "5s pain + 10s solution for <X>"

**Expected first response:**
> Before/after niche (15s, classic UGC pattern, ~$8). Drop a screenshot / logo / packaging — I won't generate without a reference.

**Flow:**
1. **Gate:** wait for the reference (see section D). Without it — refuse.
2. Match the video format / template, `ralphy project create --project <id>`, load the before/after craft-overlay skill on top (or freeform), reference in `artifacts/refs/`. *Remix variant: user named the `before-after-product` style template → `ralphy template use before-after-product`.*
3. `scenarist playbook` → 5s problem + 10s demo.
4. `art-director playbook` → 2 keyframes → 2 i2v clips.
5. `editor playbook` → captions + transition → render.

**Target:** ≤10 min, ≤$10.

### A4. Soviet-nostalgic video

**Utterance:**
- "make a Soviet-style video about <X>", "Soviet-format video about <Y>", "USSR nostalgia about <Z>"

**Expected first response:**
> Soviet-nostalgic niche (two-era TikTok narrative, ~60s, ~$12). Building from your topic. Starting.

**Flow:** match the video format / template, load the matching craft-overlay skill on top (or freeform), and run the pipeline. *Remix variant: user named the `soviet-nostalgic` style template → `ralphy template use soviet-nostalgic`; its composition is in `templates/entertainment-viral/soviet-nostalgic/`.*

---

## B. Site-style transfer

### B1. "Make it in the style of <url>"

**Utterance:**
- "take the style from https://...", "make a landing-promo in the aesthetic of <site>", "shoot it like <site>"

**Expected first response:**
> Launching `/researcher` — pulling design tokens and screenshots from <site>. ~2 min.

**Flow:**
1. `/researcher` → `extract-design.ts` → `.ralphy/references/<site-slug>/`.
2. The chat shows the extracted palette + typography + 3 screenshots → user confirms.
3. `scenarist playbook` → scenario referencing the design.
4. `art-director playbook` → prompts that pass the reference screenshots into `image_urls`.
5. `editor playbook` → render.

**Target:** ≤15 min total.

### B2. "Analyze @handle"

**Utterance:**
- "look at what @handle does on TikTok", "break down <creator>'s style", "what's going viral for them"

**Expected first response:**
> Pulling the top 10 videos for @handle, running viral-moments analysis. ~3 min.

**Flow:** `/researcher` sub-task `discover-trends` → `scrape-tiktok-trends.ts` → `scoreTikTok()` → top-N + analysis.

---

## C. Persona-required (gate active)

### C1. A real named person

**Utterance:**
- "make a video with Elon Musk", "video where <real-celebrity> does <X>", "as <blogger>"

**Expected first response (refusal with proposal):**
> "To do `<name>` well, I need a reference image (face photo, ideally 2-3 angles). Drop one in here, or switch to a generic archetype (`it-remote / courier / student`) — I won't generate without a reference, it'll come out worse than cheap AI slop."

**After the reference arrives:**
- `artifacts/refs/<name>-ref.jpg` is saved.
- `logUserAsset(id, { kind: "photo", source: ..., purpose: "persona-ref" })`.
- `art-director playbook` uses the reference in `image_urls` for every keyframe.

### C2. A branded product

**Utterance:**
- "video about Stripe", "ad for <brand>", "<product> packaging"

**Expected first response (refusal with proposal):**
> Need a logo / packaging / brand kit. Drop a photo here or a link to the site — I'll pull it through `/researcher`.

### C3. The style of a specific show / channel

**Utterance:**
- "in the style of show <X>", "like channel <Y>", "parody of <Z>"

**Expected first response:** same as C1/C2 — reference is required.

### C4. Override (explicit consent)

**Utterance:**
- `"generate without a reference, I know quality will be worse"`
- `"whatever, just make it"`

**Flow:** ok → `logUserPrompt(id, { stage: "no-ref-consent", text: "..." })` → continue without a reference.

---

## D. Refusal cases (no override)

### D1. Length we can't deliver

**Utterance:**
- "make a 5-minute film", "2-minute video"

**Expected response:**
> I'm built for short form (≤30s, optimal 15s). A 5-minute film is a different league and a different model — I'd more likely botch it than land it. We can split it into a series of ~20 shorts; or tell me which other tool you want to use and I'll help with prompts.

### D2. Incompatible content

**Utterance:**
- "video with profanity for a kids' channel", "<contradictory brief>"

**Expected response:** an explicit clarifying question + a proposal of two non-contradictory branches.

### D3. Request with no grounding

**Utterance:**
- "make a video about my grandma without a photo"

**Expected response:** see C — fall back to a generic archetype or ask for the reference.

### D4. Quality-gate failure × 2

After two failed regenerations (`scoreImage < 7` twice in a row):

> Can't get a quality image for slot `<id>` (attempts: 2, latest score: <n>). Options: a) drop a better reference, b) switch model (current is <m>), c) change the shot — e.g. close-up to medium.

---

## E. Batch tasks

### E1. "10 videos from a template"

**Utterance:**
- "make 10 videos in style X on different topics", "run a series of N <template> about <area>"

**Flow:**
1. `producer playbook` → brainstorm N non-repeating topics (LLM).
2. The chat shows the list → user confirms / edits.
3. `ralphy batch create --template <id> --topics <list>` → parallel launch of N projects via `batch-from-template`.
4. The chat reports back as a batch: rollup of costs + final mp4 paths.

**Target:** 10× 15s videos ≤25 min wall (parallel where possible), ≤$120 total.

### E2. "Review the batch"

**Utterance:**
- "how's the batch", "status of batch <id>", "which ones came out OK"

**Flow:** `producer playbook` → `batch-review` → table `id | status | cost | score | render_path`.

---

## F. Template lifecycle

### F1. "Save project <id> as a template"

**Utterance:**
- "make a template from <project>", "save this format for later"

**Flow:** `producer playbook` sub-task `template-extract` → `.ralphy/workspaces/<ws>/templates/<slug>/` with all five files + `reference-example.md` populated from the source project.

### F2. "What templates do we have"

**Utterance:**
- "what's in templates", "show available templates"

**Flow:** `ralphy template list -p` — table.

### F3. "Find a video to remix"

**Utterance:**
- "which video could I remix for <request>", "show me a template like <X> to copy"

**Flow:** `ralphy template suggest "<utterance>"` — top-3 ranked. Used both as the **cold-start format / template match** for "make a video about X" (see section A) and for **remix-shopping** when the user is explicitly browsing for a specific style template to reproduce.

---

## Coverage check

After every major change to skills or the CLI, walk this file and confirm all examples still hold. If an utterance isn't covered, either add it, or document it as explicit out-of-scope.
