<!--
  Ported (translated + condensed) from mikeshu2001/content-factory
  skills/good-writing/antipatterns.md. Attribution: mikeshu2001.
  Russian-grammar-specific rules are summarized at the bottom and link to the
  original; everything transferable is kept here in English.
-->

# Anti-patterns and the final text check

This is a doubt-moment tool, not a tick-the-boxes checklist. If a construction
is banned here but sounds natural and precise in context — keep it. If it is
allowed but sounds clumsy — rewrite. The final judge is "does it sound like
live speech".

When you find a listed construction, do not strip it mechanically. First ask
what role it plays in the paragraph. Many "banned" forms are bad in one context
and load-bearing in another.

## Neurotext markers

Rewrite when you see:

- "This is not X, it's Y" contrasts in every paragraph. Hard limit: any
  "not X but Y" (either order) at most a couple of times per text. Three or
  more, especially clustered — rewrite most of them affirmatively.
- Chopped subject-less staccato fragments ("You rework. Refine. Rework again.").
  Every sentence needs a subject and predicate and a link to the previous one.
- The repeating "dash-fragment" rhythm ("Add — extend. Change — update.").
  Artificial cadence; rewrite as connected prose.
- Impersonal narration with no authorial stance.
- Phrasings nobody says out loud.
- "In today's world...", "We all know that...", "In the age of digital..."
  openers.
- Rhetorical amplifiers that carry no information ("Looks convincing, sounds
  confident — and means nothing"). Test: does the sentence add a new fact or
  action? If the paragraph survives without it, cut it.
- Inflated adjectives ("incredibly convenient", "exceptionally useful").

## Hidden neuromarkers

Patterns that do not look like typical AI text but give the machine away:

- **Staccato rhetorical questions.** Two-three questions in a row is a marker;
  one question is fine. Rewrite as narration ("It is unclear what broke and
  when").
- **"Without X / with X" contrast.** ("Without a journal you guess blindly.
  With one — you find the cause in a minute.") Fold into one sentence:
  "Instead of guessing, you find the specific cause in a minute."
- **Dramatic block closers.** If the last sentence of a paragraph sounds like a
  slogan, simplify or delete ("Logging solves this", not "That is exactly what
  logging is for.").
- **Arrow chains in prose** ("broke → checked logs → found ERROR → fixed").
  Write connected prose instead.
- **Mirror parallel structures** ("Tests catch bugs before deploy. Logging
  catches problems on the server."). Reformulate so sentences are not clones.
  Exception: a deliberate, single, story-carrying contrast may stay.
- **Meta-announcements** ("Here is what the failure looks like:", "Let's see
  how this works in practice"). Just show the thing.
- **Boy-scout instruction bloat (what → how → why → what next).** In
  instructions keep only WHAT and HOW by default. Add WHY only where the reader
  would otherwise do the step wrong. Almost never add "what's next" — the
  structure itself leads the reader. Final-pass probe: "which sentence can this
  block lose without losing meaning?" — that sentence is ballast.
- **Negative framing where positive works.** Sentences starting "you don't
  need to..." — rewrite as what WILL happen ("The agent picks the tool and
  formats the notes itself.").
- **Literary metaphors in technical text** ("a wall of text", "flying blind").
  Prefer household analogies or plain description.
- **Academic register.** Formal definitions instead of plain explanations,
  bookish turns instead of conversational ones, re-explaining after an example
  that already made the point. Test: would a person say this to a colleague
  over coffee? If it reads like a textbook or a translation — simplify.
- **One thought dramatized twice.** A thesis followed by a scene that replays
  the same thesis emotionally. If removing the scene loses no information,
  remove it.
- **Tense drift.** Starting a sentence in imperative/future and sliding into
  present by the second verb; describing the result of the reader's FUTURE
  action in present tense or impersonal passive ("when the layers are merged" →
  "when you merge the layers"). Check every verb.
- **Tautological connectors** ("additionally add", "one more, besides X") —
  one word already carries the other's meaning; keep one.
- **Mechanical imperative+future in descriptive blocks.** Decide the block's
  genre first: instruction = imperative + future; description = modality /
  infinitive; case study = past.

## Syntactic weight

Grammatically correct but heavy. Main sign: reading aloud, the meaning fades by
the sentence end and you want to re-read.

- Two or more subordinate clauses in one sentence → split. One thought, one
  sentence.
- Long parenthetical insertions (dashes or brackets) that tear subject from
  predicate → pull the insertion out into its own sentence. One-two-word
  asides are fine.
- Bureaucratic adverbials ("as X grows", "at the moment of Y", "in the case
  of", "within the framework of", "in the course of") → rewrite with a verb or
  a plain link ("The bigger the project, the harder...").
- Four or more parallel items inside one sentence read as a list → split into
  two sentences or reformulate.
- Passive voice / impersonal constructions as the main predicate → give every
  sentence an actor.

Check: read aloud; anywhere you stumble or cannot finish in one breath is a
split candidate.

## Date pinning

Specific dates in service/product descriptions age fast and do not help
decisions. "The service recently launched a platform", not "In January 2026 the
service launched...". Exception: dates that are part of a story, chronology, or
essential context (a 1843/1947/1950 historical beat is exactly that exception).

## Excess detail in service descriptions

Every detail must help the reader choose. Entry price only ("from $17/mo"), no
full tariff grids; no duplicated price if a price block exists; limitations get
one sentence at most, not a paragraph; information flows main-flow →
extra-features, no topic jumping.

## Marketing tone

Exclamation marks; "this will change your life", "the secret of success";
stage-selling energy; artificial enthusiasm; "complete guide", "the best way",
"perfect".

## Empty generalities

"Interesting experience", "useful solution", "effective approach", "works
better", "significantly improves" — either back with specifics ("gets more
views and completions") or cut. When concrete numbers are present, drop the
amplifiers — numbers speak for themselves. Percentages: state the sample size
once, then percentages only.

## Transition paragraphs

Paragraphs that only announce the next block ("Theory is clear. Now let's look
at practice.") — delete; the heading already gives context.

## Abstract statistics as filler

Market forecasts and industry averages that lead to no reader action ("the
market will reach $X bn by 2030") — replace with a concrete recommendation or
cut. Case-study numbers tied to an action are fine. Probe every fact with:
"what will the reader DO with this?"

## Duplicates

- A definitions block + a comparison block of the same things → merge.
- A product described fully more than once → full description once, elsewhere a
  short reference.
- A thesis both closing its section AND repeated in the finale → facts live in
  the section, the summary lives once in the finale.
- Two sentences saying the same thing in a row → keep one.

## Numbered lists that are not sequences

Numbering implies ranking or order. Non-sequential points get bold lead-ins,
not numbers. Items with explanations longer than 5-7 words go on separate
lines.

## Pre-publication check questions

- Does the text sound like a live person or like a neural net?
- Any marketing intonation left?
- Are the sentences connected? Can any sentence be removed without loss?
- Is there a concrete fact in every block, or only general words?
- Is any information repeated in different places?
- Any verbal-noun constructions where a verb would do?
- Any passive predicates? Every sentence needs an actor.
- Does the addressing mode match the content type (imperative for guides,
  modality for overviews, past tense for stories)?
- Future tense for post-setup reader actions?
- Verbs agreed in tense and aspect within a paragraph?
- Any staccato fragments or repeating rhythmic patterns?
- Any transition paragraphs that only announce the next block?
- Any abstract statistics that lead to no action?
- Any duplicate blocks, numbered non-sequences, staccato rhetorical questions,
  "without X / with X" contrasts, slogan closers, arrow chains, mirror
  parallels, meta-announcements?
- Any sentence opening with "no need to" where a positive statement works?
- Any literary metaphors or audience-inappropriate jargon in technical text?
- Any sentences with 2+ subordinate clauses, or mid-sentence insertions?
- Any bureaucratic adverbials, 4+-item single-sentence enumerations?
- Reading aloud: conversation or textbook? If textbook — rewrite.
- Any date pinning that will age? Tariff overload? Detail that does not help
  the reader choose?

## Russian-grammar-specific rules (original source)

The original catalog also covers rules that only exist in Russian grammar:
verbal nouns (endings -tsiya / -nie / -ka) replacing verbs, short passive
participles as predicates, bookish copulas ("yavlyaetsya" / "predstavlyaet
soboy" / "sluzhit"), the abstract "u X est Y" construction, the letter "yo"
ban, and aspect agreement. When editing Russian copy, read the original:
https://github.com/mikeshu2001/content-factory/blob/main/skills/good-writing/antipatterns.md
