# GEO-aware SEO article

> **For the LLM drafting the next article body.** When the brief asks for a
> long-form article, blog post, or SEO/GEO piece, the rules below shape the
> body so it wins on BOTH surfaces: classic search (a snippet extractor lifts a
> clean answer) and generative engines (an LLM answering a user question cites a
> self-contained claim from the piece). Optimizing for one without the other
> leaves half the durable distribution on the table.

## When to apply

Any long-form prose deliverable that wants to rank and be cited: a how-to, an
explainer, a comparison, a landing-page-adjacent article, a docs-style guide.
The output is a markdown body with frontmatter (title, meta description, slug,
tags), destined for Medium, GitHub Pages, or a static site.

Do **not** apply to: social post copy / captions (that is the `social-copy`
skill — short, platform-shaped, hook-first), video VO scripts (that is the
scenarist), or ad copy. This is for a standing article a reader lands on.

## The two surfaces (why GEO ≠ classic SEO)

- **Classic SEO** rewards keyword coverage, scannable structure, and depth. A
  snippet extractor pulls a heading + the paragraph under it.
- **GEO** rewards **self-contained, quotable claims**. An LLM answering "what is
  X / how do I Y" lifts ONE sentence or paragraph and attributes it. If your
  claim only makes sense after three prior paragraphs, it cannot be cited.

You draft for both at once: scannable structure (SEO) built out of standalone,
quotable claims (GEO).

## The skeleton (draft in this order)

1. **Title + meta description pair.** The title is the H1 / search headline
   (front-load the primary keyword, ~55-60 chars). The meta description is the
   snippet body (~150-160 chars) — a complete sentence that answers the query,
   not a teaser.
2. **A definition / direct-answer opening.** The first section answers the core
   question in ONE quotable paragraph before any preamble. LLMs and featured
   snippets both lift this. State the answer, then expand.
3. **Scannable H2/H3 sections — one idea per heading.** Every `##` is a claim or
   a question a reader (or an LLM) might search. No wall of text; no heading
   that bundles three ideas.
4. **An explicit FAQ block.** An `## FAQ` (or "Frequently asked questions")
   section with 3-5 REAL question headings (`### How long does X take?`) and a
   quotable one-paragraph answer under each. This is the single highest-leverage
   GEO structure — it is the shape answer engines cite from most.
5. **Outbound reference links.** At least one link to a source, doc, or related
   article. Anchor every non-obvious claim to something.

## Claim-writing discipline (the GEO core)

- **Each key sentence stands alone.** A reader who sees only that sentence —
  pulled out of context by an LLM — must still understand it. Avoid
  anaphora-only reference ("This makes it faster" — faster than WHAT?).
- **Lead with the claim, then qualify.** "Ralphy renders a single video in
  under 8 minutes cold-start" beats "In our testing, under certain conditions,
  things were fast."
- **Quotable definitions.** When you define a term, write the definition as one
  clean sentence an answer engine can lift verbatim.
- **No invented facts.** Every number, date, name, and superlative must trace to
  the research the outline was built from. If you don't have the fact, don't
  assert it — reframe qualitatively. Fabricated specifics are the fastest way to
  lose citation trust (and they fail the claims gate downstream).

## Reading level + length

- **Plain, approachable register** (Flesch Reading Ease ~45+). Short sentences,
  common words, minimal jargon. Dense academic prose neither ranks nor gets
  cited.
- **Length window ~600-2500 words.** Long enough to cover the topic in depth,
  short enough that the answer is never buried. Depth beats padding — cut a thin
  section rather than stretch it.

## Model picks

| Goal | Model | Why |
|---|---|---|
| Draft body + outline | `anthropic/claude-sonnet-4.6` | Strong long-form structure, holds the claim-standalone discipline, EN/RU parity. |
| Harder register / heavier synthesis | `anthropic/claude-opus-4.6` | When the topic needs denser reasoning across many sources. |

Always verify the id against `MODELS.md` before the call — training memory is
stale.

## Checklist (the deterministic gate mirrors this)

The `seo-article` route's deterministic text-quality gate
(`cli/lib/eval/text-quality.ts`) scores exactly these axes — draft to pass it:

- Keyword coverage: the brief's target keywords appear (naturally) in the body.
- Structure: ≥3 headings, an FAQ block present, ≥1 outbound link.
- Reading level: Flesch Reading Ease at or above the floor.
- Length: word count inside the window.
