---
name: good-writing
namespace: user
description: >-
  Rules of good writing: coherence, clarity, structure, and a large anti-pattern
  catalog for catching machine-sounding text. A reference skill loaded from other
  skills whenever prose is WRITTEN or EDITED — video narration scripts, captions,
  seo-articles, social copy, unit descriptions, docs. The core idea: text must
  explain the way you would explain to a colleague over coffee — not like a
  textbook, not like marketing, not like an academic paper. Supplies the
  read-it-aloud test, the coherence rule (every sentence answers the question
  raised by the previous one), the one-thought-per-paragraph rule, active-voice
  discipline, and the pre-publication checklist in references/antipatterns.md.
  USE WHEN writing or editing any reader-facing prose: a VO script, an article
  draft, captions, publish copy — or when the user asks to check / rewrite a
  text in plain human language (in any language they phrase it), or pairs this
  skill with /humanizer for an anti-AI pass.
---

# Good writing rules

Ported (translated + condensed) from the Russian-language `good-writing` skill in
[mikeshu2001/content-factory](https://github.com/mikeshu2001/content-factory/tree/main/skills/good-writing).
The original is the source of truth for Russian-specific grammar rules; this port
keeps every transferable rule in English. Attribution: mikeshu2001. The original
files are not vendored verbatim because this repo is English-only on disk
(`docs/developing-ralphy.md`).

## How to use this skill

This is not a list of bans to tick off. It is a toolset for moments of doubt.
The goal: text should explain the way a person explains to a colleague over
coffee. Not like a manual, not like marketing, not like an academic paper.

Before editing anything, ask:

- **What does this phrase carry for the reader?** If nothing — delete it. If it
  duplicates what was already said — delete it.
- **What role does a construction play before you remove it by rule?** A formally
  "banned" construction often holds an important nuance. Understand why it is
  there first, then decide.
- **Does the majority of readers need this fact?** A detail useful to 5% of the
  audience that does not help the rest understand — cut.
- **The main test after ANY edit:** read the paragraph aloud and ask "would a
  native speaker say this to a colleague?" If not, the edit is bad even if it is
  rule-correct. Rewrite the sentence whole; do not patch one word.
- **Symptom vs cause.** Filler in one phrase usually means the whole paragraph is
  overloaded. Clean the paragraph, not the sentence. A "not X but Y" contrast
  usually means you have not found the affirmative form — find it.
- **Judge the block, not the sentence.** After any edit re-read the whole block.
  If the edit did not improve the block as a whole, it did not happen.

If a construction is allowed by the rules but sounds clumsy — rewrite it. If it
is banned but sounds natural and precise — keep it. Rules are for doubt, not a
final judge.

## Tone

Calm, informational. No marketing, no exclamation, no attempts to impress. Talk
WITH the reader, not AT them. Direct address is fine; chumminess is not. Be
direct: if something does not work, say so plainly; if something matters, say it
first, not after a wind-up.

## Coherence

Every next sentence answers the question that arises after the previous one. The
reader must never guess how two thoughts connect.

Connections must be semantic, not verbal. If one sentence logically continues
another, do not add "because / therefore / also" — those words are only for
places where the link is not obvious without them. Paragraphs must also continue
each other; a paragraph change must not feel like a topic jump.

**Progressive disclosure.** A new concept appears only after the reader has
developed a need for it. Do not open with "X is Y". First show the situation,
limitation, or question that naturally leads to X — then the term is an answer,
not a dictionary entry. After drafting, strip the headings and read the text as
one flow: if the paragraph order is unclear without headings, the logic (not the
headings) is broken.

**Quantitative steps.** Do not skip intermediate steps in a process. If a
process has stages with counts ("one video = 5 scenes, one poster per scene"),
state them explicitly and show how each stage's output feeds the next.

## Paragraphs and sentences

Paragraphs are 2-4 sentences, one thought each. Exception: explaining a new
concept or a process may take 4-6 sentences — do not shred it into fragments.

Sentences are complete, with a subject and a verb. Every sentence must move the
thought forward: if you can delete it and the paragraph's meaning survives,
delete it. One block = one job (explain, show an example, instruct, warn) — do
not mix jobs inside a block.

## Start with the point

No "In today's world..." style intros, no sentences that announce information is
coming. If the block heading is "Why the tool fails", the reader knows why they
are here — answer the heading immediately. Do not write transition paragraphs
between blocks; the heading already gives context.

## Verbs, voice, and addressing the reader

- **Instructional content (guides, lessons):** direct imperative ("Open...",
  "Upload...").
- **Narrative / overview content (essays, reviews, explainers):** modality with
  infinitive ("you can upload", "it is worth adding").
- **First-person stories:** past-tense narration, no imperative.
- **Digests:** third person, no reader address.
- **Future tense for results of the reader's future actions.** The reader has
  not set anything up yet: "the system WILL categorize", not "the system
  categorizes". Check every verb, not just the first — tense often breaks
  mid-sentence.
- **Active voice.** Every sentence has an actor. "The agent will split the video
  into parameters", not "the video is split into parameters". Passive as the
  main predicate is a defect.
- When describing what a service DOES for the user, use modality or future
  ("will generate", "can create"), not present tense — present reads as
  marketing copy. Present tense is fine for standing facts (price, supported
  languages, limits).

## Terms and jargon

Explain professional terms on first use, or replace them with plain
descriptions. Test: "would someone outside this field understand?" IT jargon
("out of the box", "hardcode", "natively") gets rewritten for a general
audience.

## Headings

Headings are navigation, not decoration: name the action or the concrete
subject, from the reader's perspective ("Which agents to try", not "Products on
the market"). One heading = one question. No clickbait add-ons.

## Formatting

Lists only where they belong: enumerations, checklists, step sequences. In
normal narration, write prose. Bold sparingly — key terms on first mention and
real warnings. Code blocks for anything the reader may want to copy (prompts,
requests, templates). Number only sequential steps; unordered points get bold
lead-ins, not numbers.

## Dashes

Use minimally. A dash often hides a skipped thought and makes text choppy.
Prefer a verb: "The tool scores calls quickly", not "Call scoring tool — fast
and accurate". (In this repo dashes in VO scripts also produce long ElevenLabs
pauses — memory `elevenlabs-multilingual-v2-em-dash-pacing`.)

## Anti-patterns and the pre-publication checklist

The full catalog — neuromarkers, hidden neuromarkers, syntactic weight, date
pinning, service-description bloat, marketing tone, empty generalities,
duplicate blocks, and the final check-question list — lives in
[`references/antipatterns.md`](references/antipatterns.md). Read it before the
final pass on any text.

Pair with [`/humanizer`](../humanizer/SKILL.md) (Wikipedia
"Signs of AI writing" catalog) — humanizer catches English-specific AI tells;
this skill owns structure, coherence, and tone.

## Russian-specific rules (apply when the copy is Russian)

The original skill carries rules that only make sense in Russian grammar. When
writing Russian copy, consult the original source files for: verbal nouns used
instead of verbs (nouns ending in -tsiya/-nie/-ka paired with adjectives),
short passive participles as predicates (forms like "sobrano/zadan"), bookish
copulas ("yavlyaetsya", "predstavlyaet soboy"), bureaucratic adverbials ("po
mere", "v ramkakh", "v khode"), aspect/tense agreement inside a paragraph, and
the ban on the letter "yo". Source:
https://github.com/mikeshu2001/content-factory/blob/main/skills/good-writing/antipatterns.md
