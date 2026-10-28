# Retention review trial (#571)

A trial of the course-grounded retention review ([`retention-review.md`](../../.agents/skills/scenarist/references/retention-review.md)) and its facts pre-check (`ralphy eval retention-check`) on five past projects, compared with what the Codex `content-autopilot-review` method would conclude on the same inputs.

## Method

- **Inputs.** Five projects with a `scenario.json` under `.ralphy/workspaces/*/projects/*/`, chosen to span shapes: a VO-led explainer, a music-only character reveal, a 20-card visual storytime, a long-form YouTube how-to, and an audio-driven interview. Everything was read-only; no project file was written or changed.
- **Facts.** `retentionCheck()` (the library behind `ralphy eval retention-check`) on each `scenario.json`.
- **Review.** The seven steps of the method on the scenario (pre-render). Where the project also has an `eval.json` / `eval-deep-vision.json`, a short post-render cross-check.
- **Codex comparison.** The Codex skill was **not executed** (the trial makes no model or network calls). The comparison applies its documented method (purpose first, criteria V01-V12, editorial pass, visual pass, script-only means execution unassessed, verified quotes beside advice) to the same inputs and records where its verdict would differ from ours.
- **Privacy.** Project ids only; content is described at topic level, no VO or brief text is quoted.

## Facts at a glance

| Project | Runtime | Scenes | Word coverage | Hook end | Promise cue | Longest quiet stretch | CTA start | Echoes opening | wps range |
|---|---|---|---|---|---|---|---|---|---|
| `gamgee-qoves-lump-side-01` | 32.8 s | 7 | 100% | 4.0 s (12%) | 4.0 s, numbered list | 0 s | 84.6% | yes (words + visual return) | 1.7-3.2 |
| `shibuya-cast-hat-reveal-20261009` | 18 s | 5 | 0% | 3.5 s (19%) | none | 4 s (visual-only) | 77.8% | no (proxy miss, see below) | n/a |
| `swipe-reels-master-20260919` | 63 s | 20 | 5% | 3.15 s (5%) | none | 59.9 s (words) | 95.0% | yes (visual recursion cue) | n/a |
| `yt-vsl-001` | 260 s | 10 | 100% | 10 s (4%) | 10 s, how-to | 0 s | 92.3% | no | 2.3-4.8 |
| `astons-alex-demo-20260908` | 82.5 s | 10 | 0% (VO lives in audio) | 3.1 s (4%) | none | 10.6 s (visual-only) | 90.4% | no | n/a |

## Per-project reviews

### gamgee-qoves-lump-side-01: pet-health comparison explainer

- **Job.** Education/trust with a possible cold-discovery entry (stated in the brief). Education fit: strong. Discovery fit: mixed.
- **Hook.** Spoken layer names the subject and promises three different possibilities: a clear curiosity promise, cue at 4.0 s (end of the hook scene). Visual cue (one fixed subject, a magnified window, three cards) belongs to the subject: strong as a plan. Stakes are weak at the open: the reason the distinction matters (one possibility is serious) arrives in scene-04 at 11.8 s, 36% in. **Mixed.**
- **One idea.** Similar-looking lumps can have different causes and appearance alone cannot tell them apart. **Strong.**
- **Development.** Every scene adds one new entity or step; no quiet stretch; rate rises 1.7 → 3.2 wps as the piece moves from naming to explaining. **Strong.**
- **Payoff.** The thesis (scene-05) followed by what a vet actually does (scene-06). **Strong** for education.
- **Next step.** An educational "ask your vet" step, no marketing ask: fits the job. A series or follow promise would only matter if the account's goal is follower growth (Experiment).
- **Visual (plan).** Locked master subject reused across scenes, fixed plate, explicit text coordinates: strong plan; legibility and continuity unassessed pre-render.
- **Top fixes.** P1: signal why the distinction matters inside the opening statement for cold viewers (direction only; the rewrite goes through the normal scenario loop). P2: verify the headline reads at the hook's actual speed.
- **Post-render cross-check.** `eval.json` flags `structure.hook-zone-static` (no cut for 32.9 s) and `captions.thin` (0.61 words/s). The method treats both as context: a fixed-plate comparison with switching cutaways is a deliberate continuous-shot mechanism, and caption density has no universal floor. The `brief.intent-drift` fail is a real execution gap but not a retention defect.
- **Codex comparison.** Agrees on job, idea, development, payoff and the late-stakes point (its V02 "relevant reason to watch"). This scenario was written under the Codex skill per a workspace memory rule, so agreement is expected. Differences: Codex would mark delivery and rhythm unassessed rather than reading the wps ramp, and would not comment on the loop-back at all.

### shibuya-cast-hat-reveal-20261009: music-only character hat-reveal

- **Job.** Discovery/entertainment remix of a trend format. No conversion job: next step n/a.
- **Hook.** Visual-only: a recognizable character starts the hat gesture. The promise ("the hat triggers the next reveal") is only legible if the first tug visibly causes the change; the handoff carries the whole hook. Sound (the source track) is unassessed pre-render. **Mixed** (strong cue, promise depends entirely on execution).
- **One idea.** One gesture, a chain of reveals. **Strong.**
- **Development.** Each scene reveals a new character (new visual information); four equal 3.5 s beats are an intentional rhythm if cut to the music. **Strong** as a plan. Fact worth verifying: the scenario jumps from scene-04 to scene-06; the storyboard's group-establish beat (scene-05) is absent.
- **Payoff.** The full cast repeating the opening gesture in sync: a structural callback. The lexical loop-back proxy missed it because the callback is described as an action, not with a "return to" phrase.
- **Visual (plan).** Wardrobe and location are contextual to each other; character continuity across mixed media is the main risk.
- **Post-render cross-check.** The deep-style pass reports the tug never happens and reveals are hard cuts. The method consolidates five separate style/brief failures into one root cause: **the payoff mechanism is undelivered (P0 for this job)**, because the same action is the hook's promise, the transition and the finale. It agrees with the eval verdict. It disagrees with `structure.hook-zone-static` and `captions.missing` as defects: a music-only reveal can be captionless and the scene detector saw one continuous clip.
- **Codex comparison.** Same P0 (an undelivered central promise invalidates the job), same n/a for captions and CTA. Codex's mandatory clothing line would explicitly praise the wardrobe-location fit; ours covers it in the styling row. Codex would not surface the missing scene-05, since it does not read scenario structure facts.

### swipe-reels-master-20260919: 20-card visual storytime

- **Job.** Discovery/entertainment. No conversion job.
- **Hook.** On-screen caption plus a bulging bag: an open question about what is inside. **Strong** as a plan (curiosity that the story pays off).
- **One idea.** One delivery mystery resolved through the comments device. **Strong.**
- **Development.** Every card adds a story beat (doors, refusal, comments drawer, egg, crack, reveal, fee gag). **Strong.** The facts report a 59.9 s quiet stretch and 5% word coverage; that is a proxy artifact: the on-image words live in scene notes without a caption cue, so the pre-check cannot see them. The review overrides it.
- **Rhythm.** All 20 cards hold an identical 3.15 s whatever their load: text-bearing gag cards and pure swipe transitions get the same time. P2 at plan level, verify after render: vary holds by content and run the A-to-C test on the back-to-back transition beats (scene-03/04, scene-13).
- **Payoff.** The reveal at about 70% and the punchline at about 85%, then a recursion ending that invites a rewatch. **Strong** (a suspense build that does not spend the climax early).
- **Next step.** None, which fits discovery. Experiment: the recursion naturally sets up a part two.
- **Codex comparison.** Agrees on job, hook, idea and payoff. **Disagrees on rhythm:** Codex would mark pacing unassessed from a script and at most list varied holds as an Experiment; our facts pass makes the uniform plan visible, so we raise it as a plan-level P2 to verify. Codex would not compute word coverage, so it would never be misled by the quiet-stretch proxy either.

### yt-vsl-001: long-form YouTube how-to

- **Job.** Trust/education with a community conversion (free Discord) for a qualified builder audience.
- **Hook.** Specific numbers plus an explicit promise of the deliverable, which lands at 10 s, the end of the opening statement. **Strong**; a 10 s opening is fine for long-form, and the course sets no fixed hook length.
- **Handoff.** **Weak.** After the promise come 65 s of setup: a 25 s credentials and positioning beat and a 40 s audience call-out. The scene that opens the rules starts at 75 s (29% of runtime). P1: carry the viewer from the promise into the first rule, keeping a much shorter credibility beat (the trust job needs some).
- **One idea.** One format, three rules, one recipe. **Strong.**
- **Development.** The three rules each add something. A community pitch between the rules and the recipe (scene-07, 53%) interrupts before the payoff. P2: move it after the value. The ask-cue proxy missed it because it is phrased as a statement, not an imperative.
- **Payoff.** **Mixed.** The recipe (scene-08, 70 s, the longest beat) is high-level and defers the full setup to an external doc, against a promise to know exactly how to build it. P1: narrow the promise to what the video teaches, or show the working steps on screen when they are named.
- **Claims.** A platform-weighting statement and a large view-multiplier attributed to one technique are stated as fact. P2: present them as the creator's observation; the course treats such claims as dated hypotheses.
- **Timing plan (fact).** Scene rates run up to 4.8 wps (scene-02) and 4.2 wps (scene-04) for a creator who will record their own voice; at a natural pace the cut will run well past the 260 s target. VERIFY before recording (a plan inconsistency, not a retention rule).
- **Next step.** Next-episode tease plus community link and subscribe: a credible reason to return. **Strong.**
- **Codex comparison.** Agrees on the handoff (its verified example of carrying the hook into the substance is the same lesson), on payoff deliverability (its T03), and on the claims (its V11). It would mark delivery and pacing unassessed with no audio, so the wps timing inconsistency is ours alone.

### astons-alex-demo-20260908: audio-driven interview advice short

- **Job.** Trust/education (negotiation advice across countries), possibly discovery.
- **Facts (degraded).** The scenario carries no VO text: the script lives in the brief and the audio, so wps and the quiet stretch fall back to scene boundaries. As a supplementary fact outside the pre-check, the caption track holds 162 words over 82.2 s (about 2.0 wps).
- **Hook.** An offscreen interviewer question over a listening presenter: a question-led open loop. **Strong** as a format.
- **One idea.** One question answered country by country: a list that serves one idea. **Strong.**
- **Development.** Each answer adds a country and a takeaway; accumulating labels make progress visible; a late bonus question works as an attention reset. **Strong** as a plan. The identical Q-to-A rhythm across eight segments is intentional for a list, but needs checking in playback.
- **Payoff / next step.** Micro-payoffs per answer plus a bonus; no explicit ask, which fits trust. Experiment: a save prompt suits a list of reusable tips.
- **Visual.** A fixed presenter in an office setting fits the advice register; continuity of the generated presenter is the main risk.
- **Post-render cross-check.** The eval's register-mismatch and intent-drift failures are execution issues the method agrees with. Its `structure.hook-zone-static` and `style.timing-hook-first-3s` warnings are rubric-derived; a locked-camera interview with a question hook is a valid continuous-shot choice.
- **Codex comparison.** Agrees on structure and job. Codex would work from whatever transcript exists, so it is not blinded the way our scenario-only pre-check is. It would also give the presenter's styling its own explicit line.

## Aggregate findings

1. **The facts pass is strongest on VO-led canonical scenarios** (2 of 5: full coverage, useful hook, rhythm and timing facts) and degrades on visual-led or audio-driven ones (3 of 5: 0-5% word coverage). It degraded gracefully every time, with notes, and never produced a false verdict, because it produces none.
2. **Rubric-derived eval flags were context-dependent in every evaluated project.** `structure.hook-zone-static` fired on all three projects with an `eval.json` (a fixed plate, a continuous music clip, a locked interview); caption-density or missing-caption flags fired on two. The method classified all of them as format choices, not retention defects. This is the clearest evidence for the reconciliation notes in `docs/virality-rubric.md`.
3. **The highest-value findings were structural, not numeric:** a 65 s handoff after a strong promise (yt-vsl-001), stakes arriving at 36% (qoves), an undelivered payoff mechanism that explains five separate eval failures (shibuya post-render), and uniform holds across 20 cards with very different loads (swipe-reels).
4. **Proxy limits observed.** The loop-back proxy caught 2 of the 3 real callbacks (lexical echo and a recursion cue) and missed an action-described gesture callback. The ask-cue proxy missed a mid-video community pitch phrased without an imperative. The quiet-stretch proxy cannot see on-image text described in free-text notes.
5. **Agreement with the Codex method.** Job, one-idea and payoff verdicts matched on all five projects. The disagreements are about evidence and form, not principle: (a) our plan-level facts raise timing-plan and rhythm-plan items (yt-vsl wps, swipe uniform holds) that the Codex method marks unassessed for a script; (b) we cite anchors, not verified quotes, because course text cannot be committed; (c) the Codex method gives clothing its own mandatory line where ours folds it into character styling; (d) the Codex method forbids replacement copy, while ours hands the rewrite to the normal scenario-iteration loop after the review.

## Follow-ups not done here

- Let the pre-check read `captions.json` word timings when the scenario has no VO (the astons case).
- Extend the visual-return cue list to action callbacks ("repeats the opening gesture") and the ask cues to declarative pitches.
- Decide whether `scoreScenario()` hard fails should become content-job aware (a code change to the gate; this issue only reconciled the docs).
- Optionally wire `retention-check` into `ralphy eval run` as an advisory, never-blocking step.
