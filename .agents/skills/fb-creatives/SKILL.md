---
name: fb-creatives
namespace: user
description: >-
  How to make an N-creative FB / Meta / IG static ad pack for a real brand — generalized niche know-how, not one specific ad. A domain overlay on the standard pipeline: supplies the 5-set creative matrix (A real-people · B graphic / typography · C proof / data-viz · D meme · E niche-audience), the site-grounding pre-flight (curl CSS hex + Playwright hero screenshot used as `--ref` on every gen), the true-parallel batch shape on `openai/gpt-5.4-image-2`, the per-set prompt cookbook (testimonial portrait, code-card poster, strikethrough price stack, horizontal bar chart, meme header), and the deliverable folder layout (numbered PNGs + `ads-copy.md` + `README.md`). Works for ANY brand the user names — a SaaS dev tool, a DTC product, a B2B service — the skill supplies the matrix know-how, the user supplies the brand + URL.
  USE WHEN the user asks for an "ad pack", "32 creatives", "FB / Meta / IG ads", "creative matrix", "set of static ads", "performance creatives for <brand>", with N ≥ 4 stills and a single concrete brand / site.
  This is a niche SKILL (generalized), not a remix TEMPLATE. For "remix this exact ad but swap X", that is the remix path in docs/skills-vs-templates.md. For a single poster, use /poster.
---

## Trigger

**FIRES** on a generic N-creative ad-pack brief: "make 32 FB creatives for <brand>", "ad pack for <site>", "set of Meta ads", "creative matrix", "8-10 static ads for IG feed", "performance creatives for our cold-traffic campaign". Any brand, any vertical — the skill is brand-agnostic.

**DO NOT FIRE** when:
- The brief is for ONE still (poster, drop graphic, hero image) → use [`/poster`](../poster/SKILL.md) instead.
- The brief is for a moving video (UGC / unboxing / talking-head) → match the matching `/ralphy-ugc-*` skill.
- The user points at one specific ad to reproduce (`@template:<slug>`, "remix this exact ad") → that is the **remix path**. See [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md).
- The user pasted `@guideline:<slug>` for a register the pack sits in (photoreal humans, anti-AI-slop) → run `ralphy guideline show <slug>` first and fold its rules into the A-set portrait prompts.

## What this skill is

A generalized matrix overlay, not a finished ad pack. It does not name a brand, a hero, a price, or a number — it tells the art-director HOW a multi-register static ad pack is built so a strong one comes out for whatever the user is promoting. It runs **through** `ralphy generate image`; it does not bypass the reference-required gate or the site-grounding invariant.

## Hard invariants

- All generation routes through `ralphy generate image` (no raw API). Read `MODELS.md` before naming any model id — the stack below is a default, not a hardcode.
- **Real-brand pre-flight: site-grounding before ANY prompt.** When the brief names a real brand URL, **dispatch a Playwright sub-agent** to crawl home + `/docs` + `/pricing` + `/features` + `/examples` BEFORE drafting brand-DNA. Read `artifacts/refs/research.md` (the sub-agent's digest), not a single `WebFetch` of the home page. Every palette hex in a prompt must trace to `artifacts/refs/tokens.json`; every named API symbol in code-creative slots must trace to "Documented API surfaces" in `research.md`. Skipping this cost `sotaocr-fb-001` $1.20 (wrong-palette v1 burn) + 5/32 hallucinated-Python-SDK creatives. Full discipline: [`.agents/skills/researcher/references/site-grounding.md`](../../../.agents/skills/researcher/references/site-grounding.md).
- **`--ref artifacts/refs/hero.png` on EVERY gen.** Once captured, pass the live-site hero screenshot as `--ref` on all N creatives. Brand-palette + type drift across the pack drops to near zero. Without it, each prompt re-interprets "blue CTA" slightly differently — at 32 concepts the drift compounds.
- **Verify SDK / API surface before any code-creative.** If the C / E sets render code on screen, the named API symbol (`import foo`, `foo.parse()`) must exist on the brand's docs. If the landing only documents curl, the ad shows curl — not an invented Python wrapper. Curl is the strictly-safe fallback for HTTP APIs.
- **Append-only on regen.** Re-rolling a slot writes `.v2.png`, never overwrites. Failed / dark-bg v1 generations stay on disk as A/B reference.
- The reference-required gate still fires for **named real persons / IPs** in the A or D set — refuse without a ref or logged `--no-ref-consent`.
- The quality gate refuses, not warns — two failed `scoreImage` in a row → stop and report options.

## The niche, in one paragraph

An N-creative FB pack lives or dies on **brand consistency across distinct registers**. Ads-Manager wants 8-32 visually-distinct creatives to feed its A/B engine, but every one must read as the same brand at thumb-stop speed. The 5-set matrix gives the campaign 5 register-buckets (real people, typography, proof / data-viz, meme, niche-audience), each with 2-8 concepts inside; site-grounding + a `--ref hero.png` glue holds the brand together across all of them. The pack ships as numbered PNGs + a `ads-copy.md` (primary text / headline / description / CTA per creative) + an Ads-Manager-grouping `README.md`.

## The 5-set creative matrix

| Set | Register | Default concepts | Model |
|---|---|---|---|
| **A — real people** | photoreal candid portraits / testimonials with pull-quote | 4-9 diverse personas (age / ethnicity / wardrobe / setting); each is a pull-quote card layout: photo block + slate-900 quote + blue accent + emerald supporting-stat + CTA pill | `openai/gpt-5.4-image-2` |
| **B — graphic / typography** | wordmark posters, price-stack with strikethrough, data-viz bar chart, code-card | 4-8 visual hooks anchored on a *specific number* from the lander ("$0.003", "5× cheaper", "13 points more accurate") | `openai/gpt-5.4-image-2` |
| **C — proof / dashboard** | screenshot-flavored proof shots: dashboard tile, code-card output, before-after | 4-6 receipts: "we tested all of them", "1 PDF → 1 API call → clean markdown" | `openai/gpt-5.4-image-2` |
| **D — meme** | meme-header on a brand-tinted canvas, dunk-on-competitor, "POV: …" | 2-4; meme should ladder back to one product claim, not generic | `openai/gpt-5.4-image-2` |
| **E — niche audience** | targeted to one persona segment (indie hacker, AI engineer, ops lead, finance ops) | 2-6 segment-specific concepts; can reuse A / B / C templates with niche copy | `openai/gpt-5.4-image-2` |

The matrix scales: 8-12 starter A/B pack → 24-32 full matrix → 40+ broad-spectrum. Default mix for a 32-pack: A=9, B=8, C=7, D=4, E=4.

## Site-grounding (the T1 step)

Before writing any prompt:

1. **Dispatch sub-agent** (via `Agent` tool, `subagent_type: "general-purpose"`) to crawl home + `/docs` + `/pricing` + `/features` + `/examples` + `/blog`. Sub-agent returns `artifacts/refs/research.md` (the digest), `artifacts/refs/tokens.json` (CSS hex), `artifacts/refs/hero.png` (Playwright screenshot), and an enumerated "Documented API surfaces" list (curl / Python / TS / GUI).
2. **Read `artifacts/refs/research.md`** — never sketch brand-DNA from memory.
3. **Write `brand-dna.md`** with REAL hex values from `artifacts/refs/tokens.json`, the real type stack, the real CTA color, the real hero claims.
4. **Lock the voice register** at intake (dev-honest / marketing-punchy / mix). Anchor every prompt on a *specific number* from the lander.

## Workflow

1. **Intake.** Run the creative-pack branch of intake (aspect for placements: 4:5 FB feed / 1:1 IG feed / 9:16 Stories / mix; pack size; sets to cover; brand site URL — REQUIRED; voice register; hard no's).
2. **Site-grounding.** Dispatch the Playwright sub-agent (see above). Read `artifacts/refs/research.md`. Write `brand-dna.md`.
3. **Concept matrix.** Draft the 5-set scaffold; pick the N concepts the user wants. Surface the matrix in chat; get explicit "go".
4. **Prompt scaffold.** One `prompts/<slot>.txt` per concept. Each cites brand-DNA hex verbatim, names a specific photographic spec (camera/lens/grain for A-set, syntax-color spec for code-cards in B/C), includes a ban-negative for known failure modes (beauty filter, plastic skin, missing strikethrough, dark background when site is light).
5. **Generate — TRUE PARALLEL via bash `&`.** `gpt-5.4-image-2` validated for 23-concurrent (sotaocr-fb-001, 2026-05-29). NOT `ralphy queue` — the daemon was idle on 13 jobs that session. Each gen passes `--ref artifacts/refs/hero.png`.
6. **Review + iterate.** Read all PNGs inline. Re-roll only mis-rendered slots (not the whole batch). Auto-versioning preserves v1.
7. **Deliverable.** `final/` with numbered prefix, `ads-copy.md` (primary text · headline · description · CTA × N), `README.md` with the concept-by-concept table + Ads-Manager ad-set grouping (real-people / diverse-personas / numbers / editorial-graphic / proof-dashboard / code / meme).
8. **Hand off** to `/evaluator` if the user wants a quality gate before delivery.

## Default model stack (verify against MODELS.md)

- **Default — `openai/gpt-5.4-image-2`.** Production-grade parallel (validated 23-concurrent at $0.20/img). Crisp typography (the wordmarks, price stacks, code-cards, syntax coloring). Use for all 5 sets. Aspect via `--size` (FB feed `--size 1080x1350`, IG feed `--size 1080x1080`, Stories `--size 1080x1920`).
- **Fallback — `google/gemini-3-pro-image-preview`.** Faster, cheaper, tolerates ≥4 concurrent, but smudges small embedded typography. Use ONLY for fast palette/composition exploration; finalize on gpt-image.

## Failure modes

- **Brand-DNA invented from memory** (dark-bg + orange when site is white + blue). Cost on sotaocr-fb-001: $1.20 + 12 min. Prevention: site-grounding sub-agent + `artifacts/refs/hero.png` on T1.
- **Believing stale "cap=1 concurrent" memory on gpt-image** → 25 min wasted on a serial loop. Prevention: 2× parallel probe before architecting any batch shape; gpt-5.4-image-2 is production-grade parallel as of 2026-05-29.
- **`ralphy queue` daemon idle on pending jobs.** Use bash `&` fan-out, not `--queue`, for ad-hoc N-image batches until the daemon is reliable.
- **Hallucinated SDK in code-creatives.** Model auto-completes Python ergonomics from training prior even when brand only ships curl. Verify every named symbol against `artifacts/refs/research.md` "Documented API surfaces"; fall back to curl when SDK unverified.
- **Generic "Better X for Y" copy.** Cold-traffic FB copy lands when anchored on a specific lander number. Always anchor each headline on one verifiable claim from `brand-dna.md`.
- **A-set portraits going beauty-filter editorial.** Without "naturalistic, NOT glossy" + camera/lens spec + named imperfection in the body, gpt-image defaults to fashion-magazine glaze. See the A-set cookbook below.
- **Missing strikethrough policy in price stack.** Without an explicit anti-token, gpt-image sometimes applies the strikethrough uniformly across rows. Always state row-by-row policy + negative "strikethrough on the brand row".

## Aspect ratio

`--size` is honored by gpt-image as of `loud-kids-poster-001` (lands on nearest native bucket). Defaults:
- FB feed → `--size 1080x1350` (4:5)
- IG feed → `--size 1080x1080` (1:1)
- Stories → `--size 1080x1920` (9:16)
- Mix → fan out separately per placement, do not auto-crop.

## Cookbook

### A-set — real-people testimonial (validated on sotaocr-fb-001 A2/A6/A7/A9)

```
LAYOUT (top to bottom):
1. PHOTO BLOCK (52% height): Rounded 24px-radius photograph filling width with 5% margin.
   CONTENTS: a photoreal candid portrait of <persona> — <2-3 specific features:
   age, ethnicity, hair, wardrobe>. Natural skin texture with visible pores,
   <named imperfection: mole / asymmetry / stubble>, slight facial asymmetry.
   <Setting + lighting>. Sony A7 IV, Sigma 85mm at f/2.0, Kodak Portra 400 grain,
   naturalistic, NOT glossy.
2. QUOTE CARD (30% height): Pure white panel, 88% width, thin border, soft shadow.
   - Pull-quote slate-900 Inter Medium ~52pt, slight italic, blue <ACCENT> open-quote glyph
   - Attribution slate-400 Inter Regular ~26pt
   - Below, emerald #10B981 Inter SemiBold supporting stat
3. CTA + URL FOOTER (18%): Blue <ACCENT> pill + slate-400 sub-line.

Negative: dark background, orange accent, plastic skin, beauty filter, AI fingers,
perfect teeth, frozen expression, fashion-editorial pose.
```

Key tokens: **"naturalistic, NOT glossy"** + **camera + lens + grain spec** + **named imperfection in the body**.

### B-set — price-stack with strikethrough (validated on B4/B8)

```
PRICE STACK (50% height): Four large rows stacked vertically with generous spacing.
Each row: vendor name (left, slate-900 Inter Medium ~36pt), large price
(right, Inter Black ~64pt). Vendors with strikethrough have a 4px red #DC2626
line running cleanly through the ENTIRE row (label + price) horizontally at
vertical center. The <BRAND> row has NO strikethrough and uses emerald #10B981
for the price.

Row 1: "<Competitor 1>" — "<price>" (with red strikethrough through both)
...
Row 4: "<BRAND>" — "<price>" (NO strikethrough, emerald price, small "←" arrow)

Negative: strikethrough on the <BRAND> row, missing strikethrough on the
competitor rows, broken/wavy/dashed strikethrough lines.
```

Key tokens: explicit row-by-row spec + **explicit anti-token "strikethrough on the BRAND row"**.

### B / C / E — code-card (validated on B3/C7/E3)

```
CODE CARD: A floating window-chrome card centered, ~88% canvas width, 25px corner
radius, soft drop shadow. macOS-style window-chrome header with three small
circles (red/amber/emerald), centered title "<file>.py" in JetBrains Mono.
Card body deep navy #0F172A background. Inside, 3-4 lines of crisp monospace
code (JetBrains Mono ~30pt) with line numbers in muted #475569.

Syntax: keywords blue #60A5FA, strings emerald #34D399, comments slate-400 #94A3B8,
variables cream #F1F5F9.

Line 1 (comment): # <one-line value claim>
Line 2: <curl OR import — must match the brand's documented surface>
...
```

Key tokens: **macOS chrome description verbatim** + **explicit syntax-color-per-token mapping** + **line numbers gutter spec**. Verify the named API surface against `artifacts/refs/research.md`.

### C-set — horizontal bar chart (validated on B2)

```
HORIZONTAL BAR CHART: Four horizontal bars stacked vertically.
Each row has three columns:
   - LEFT: brand label, slate-900 Inter Medium ~32pt, left-aligned
   - MIDDLE: bar — rounded ends, height ~64px, track #F3F4F6, fill in row color
   - RIGHT: percentage, large Inter Bold ~48pt, right-aligned

Rows (top to bottom):
- "<BRAND>" · bar filled emerald #10B981, length 95% · "95%" in emerald
- "<Competitor>" · bar filled slate-400 #9CA3AF, length 82% · "82%" in slate-400
...
```

Key tokens: explicit three-column spec per row + named track + fill colors + named bar length as % of canvas.

## CLI cookbook

```bash
# Site-grounding sub-agent (dispatched via Agent tool — see site-grounding.md
# for the full prompt template). Output lands at artifacts/refs/research.md + artifacts/refs/hero.png.

# Per-creative generation — TRUE parallel via bash & fan-out
for slot in a1 a2 a3 b1 b2 b3 c1 c2 c3 d1 d2 e1 e2; do
  ralphy generate image --project <id> --slot "$slot" \
    --model openai/gpt-5.4-image-2 --size 1080x1350 \
    --ref artifacts/refs/hero.png \
    --prompt "$(cat prompts/$slot.txt)" &
done
wait

# Re-roll a single mis-rendered slot (writes .v2.png — append-only)
ralphy generate image --project <id> --slot a5 \
  --model openai/gpt-5.4-image-2 --size 1080x1350 \
  --ref artifacts/refs/hero.png \
  --prompt "$(cat prompts/a5.txt)"

# Quality gate
ralphy project score <id> --strict
```

At ~$0.20/creative on gpt-image, a 32-pack ≈ **$6.40 / ~25 min** (with site-grounding done first); the sotaocr-fb-001 reference ran $8.00 / ~30 min because of the wrong-palette v1 burn.

## See also

- [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md) — why this is a skill and not a template.
- [`.agents/skills/researcher/references/site-grounding.md`](../../../.agents/skills/researcher/references/site-grounding.md) — the Playwright sub-agent prompt template (mandatory T1 step).
- [`.agents/skills/intake/SKILL.md`](../../../.agents/skills/intake/SKILL.md) — the creative-pack branch of intake.
- [`.agents/skills/art-director/SKILL.md`](../../../.agents/skills/art-director/SKILL.md) — model picks + ref-anchor flow.
- `MEMORY.md` — anti-ai-slop image prompts, OR parallel gpt-image OK, verify SDK before code-creative, site-grounding before brand-DNA.
- Reference postmortem: `.ralphy/workspaces/<ws>/projects/sotaocr-fb-001/postmortem/` — the lessons + matrix this skill codifies.
