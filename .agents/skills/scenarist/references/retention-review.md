# Retention review (Content Autopilot method)

A structured editorial review of a scenario (before render) or a finished cut (after render), grounded in the Content Autopilot course the owner studied. It answers one question: **for the job this piece is meant to do, where does a viewer lose a reason to keep watching, and what would fix it?**

It is a review method, not a gate. Nothing here blocks a handoff or a render. It runs beside the deterministic gates (`ralphy project score`, `ralphy eval video`) and is allowed to disagree with them; when it does, say so in the review and let the user decide.

Two places use it:

| Pass | When | Owner | Output |
|---|---|---|---|
| Pre-render scenario review | After the first `scenario.json` draft, before the storyboard lock | scenarist | `<project>/RETENTION_REVIEW.md` |
| Post-render editorial review | After `ralphy eval video`, alongside the eval report | evaluator | `<project>/RETENTION_REVIEW.post-render.md` |

Both files are new artifacts. A second pass on the same project writes `.v2.md`, never overwrites (AGENTS.md invariant 14).

## Sources and anchors

Every rule below is written in Ralphy's own words. Each carries one or more **source anchors** of the form `[CA: <lesson id> @ hh:mm:ss]`. An anchor is a pointer, not a quotation: it says where in the course the idea is discussed so a reviewer can check the original context.

- **Resolving an anchor.** The archive path comes from `RALPHY_CA_ARCHIVE`, then the workspace setting `contentAutopilotArchive` (`ralphy config set contentAutopilotArchive <path> --workspace <ws>`), then the default `~/Desktop/Content-Autopilot-Archive`. `ralphy eval retention-check` prints the resolved path and whether it exists. Under that root, `index.json` maps the lesson id to its title and file stem; the study notes are `02_distilled/<lesson id>-*.md` (bracketed timestamps) and the full subtitles are `01_transcripts/<lesson id>-*.md`. Timing is subtitle-cue granularity, so look a few seconds either side.
- **Archive absent.** The method still works as written. Anchors become unresolvable pointers; say "anchor not checked" when a judgment leans on one.
- **Paid material.** Never paste transcript text or course quotes into the repo, into project files, or into anything that ships. In a review, paraphrase the principle and cite the anchor.
- **Not a checklist.** The course itself warns against one universal checklist [CA: lesn_kGcyA735CLYow @ 00:29:58]. Pick the rules that bear on the piece; related rules are not extra penalties for the same fault.

## Step 0: evidence record and the facts pass

Write down what was actually inspected before judging anything.

- **Pre-render:** `scenario.json` (read it through `ralphy project show <id> --scenario`), `BRIEF.md`, `STORYBOARD.md`, the production plan if any. Delivery, audio, real pacing, legibility and continuity are **unassessed**: a script is a plan, not an execution.
- **Post-render:** the final mp4, `eval.json` / `eval-deep-vision.json`, the caption track or a transcript. Sampled keyframes do not establish continuous pacing, audio quality or lip sync; only the native-video pass and actual playback do.

Then run the facts pass:

```bash
ralphy eval retention-check <project>     # or a path to any scenario JSON
```

It reports facts only and never fails: hook-scene end, the estimated time the first statement and the first promise cue land, words per second per scene, the longest single beat, the longest stretch with no new VO or on-screen words, CTA position as a percent of runtime plus any ask cues inside the VO, and whether the last beat echoes the opening. Copy the numbers into the review's Facts section and interpret them against the job. A 70-second quiet stretch is a defect in a talking explainer and is the whole point of a silent visual reveal.

## Step 1: name the content job first

Decide what the piece is for before grading anything else. "Good" means something different for each job [CA: lesn_M8qINobHgTn6T @ 00:16:44] [CA: lesn_L5GcOQcft5QqM @ 00:05:17]. Judge the hook, the specificity and the next step against that job, and say so when the stated goal and the execution's best use differ [CA: lesn_295V15am4RvHEVOaq38R9f @ 00:09:06].

| Job | What the viewer needs | What "working" looks like |
|---|---|---|
| Discovery / reach | A reason to care without knowing the creator | Accessible premise, relatable stakes, a standalone payoff someone would share |
| Trust / education | A reason to value the creator's knowledge | Specific reasoning, a demonstration, a usable insight |
| Qualified inquiries | Recognizing their own situation, and a fitting next step | The intended person's problem is named; the ask says what they get |
| Sales / booking | Enough relevance, confidence and logistics to act | Benefit before mechanics, proof where doubt is likely, one clear action |
| Customer / community update | A relevant update for people who already know the creator | Necessary context, warmth, no re-introduction to strangers |

Rules:

- A stranger must get a concrete reason to care when the job is discovery; a follow-up or community clip may assume context if that is declared [CA: lesn_8dKTdjJTFkaB6 @ 00:02:09] [CA: lesn_lLECnECbVjZtn @ 00:20:32].
- Niche is not weak, and reach is not the only win: a narrowly specific sales piece can outperform a viral one commercially. Low views alone never prove failure [CA: lesn_M8qINobHgTn6T @ 00:16:44].
- Funnel labels are a lens, not a rigid taxonomy; one piece can blend trust and reach [CA: lesn_yqmx5as7XpoMx @ 00:04:58].
- If the brief states no goal, infer one, label it as inferred, and recommend a primary job instead of asking the user to choose every time.

## Step 2: the hook earns attention and matches the promise

- **The hook is the whole opening statement**, the stretch that establishes why to keep watching, not a fixed first-N-seconds window [CA: lesn_f8qGqPCtYoGBH @ 00:08:43] [CA: lesn_iRdPoMpJQ92BX @ 00:23:09]. Holding attention is a whole-video job; the opening only starts it [CA: lesn_pbdzLEVqX7oNN @ 00:38:53].
- **Read three layers and their agreement:** the spoken line, the on-screen text, and the opening image or action. Text that says one thing while the voice says another confuses the viewer at the exact moment they decide [CA: lesn_FB9xS3RdC8spL @ 00:41:11] [CA: lesn_01NvK6khHjbtR @ 00:12:53]. Saying the same thing in voice and text is allowed; it helps sound-off viewers.
- **The attention cue belongs to the subject.** A prop, action or setting that relates to the topic stops the scroll; random shock attracts the wrong viewer and proves nothing about the idea [CA: lesn_ind8Fi53r3T3j @ 00:03:50]. Stacking cue types is an option, not a required count [CA: lesn_ind8Fi53r3T3j @ 00:03:42].
- **Prefer an open question to a closed sentence.** An opening that is a complete, self-contained statement lets the viewer decide instantly whether to leave; an opening that leaves a question hanging pulls them into the next beat [CA: lesn_pbdzLEVqX7oNN @ 00:39:50]. Keep enough context that the promise is still understandable, and pay the question off [CA: lesn_ind8Fi53r3T3j @ 00:10:06].
- **Readable at its actual speed.** An opening that flashes by is missed; one that crawls loses the viewer. Add a beat when the reveal is too fast, trim inert delay when it is too slow [CA: lesn_V6DvbBMxhkXvg @ 00:02:36]. Name the topic clearly enough that a new viewer knows what is being offered [CA: lesn_EsWMeOOBjYiWY @ 00:04:23].
- **One entry, not three.** Pick the strongest relevant opening and drop duplicate setups; a long throat-clearing introduction in a talking video drags [CA: lesn_FB9xS3RdC8spL @ 00:49:19] [CA: lesn_rbBYE83jn1IOV @ 00:59:42].
- **The handoff is where viewers leave.** The sentence and cut right after the hook should carry the viewer straight into the promised substance; self-commentary, a second introduction or a restated hook there loses people the hook just won [CA: lesn_Rvzrje06xQob6 @ 00:29:07] [CA: lesn_5Trk5PhZy6hQ2nVNHbElMt @ 00:45:42].
- **The opening sets the pacing contract.** Fast cutting that suddenly slows reads as boring; keep the rhythm the opening promised or change it deliberately [CA: lesn_L5GcOQcft5QqM @ 00:19:12].

Record three moments when the evidence allows: the first attention cue, the moment the promise is understandable, and the first substantive value. These are diagnostics, not targets. The facts pass estimates the second one from the script (`hook.promiseCueS`).

## Step 3: one clear idea

- **One topic or storyline per short piece.** Tangents and second missions cut retention; a second valuable point is a second video [CA: lesn_vnCkLaM2HbB7O @ 00:47:59] [CA: lesn_Cx3NXX0fMsWKf @ 00:14:29] [CA: lesn_9Ki3nRw1LJ8kq @ 00:03:09].
- **A list, comparison or multi-step tutorial can still be one idea** when every item serves the same promise [CA: lesn_5Yx49Buee92JY @ 01:04:07].
- **State it in one sentence:** the topic, the angle (the specific claim, problem or story), and the viewer reward (what they learn, feel, see or can do). If the sentence needs an "and also", the piece has two ideas.
- **Fix the idea before decorating it.** More cuts, graphics or hooks cannot rescue an uninteresting premise [CA: lesn_62cCxwbRjoC2W @ 00:49:10] [CA: lesn_YtOzS65VhbEe8 @ 00:54:37].

## Step 4: development adds new information

- **After the hook, deepen understanding or connection.** The build-up is where the viewer starts to feel the stakes; it is not permission for a long preamble, and a direct demonstration can do the job on its own [CA: lesn_f8qGqPCtYoGBH @ 00:10:24].
- **Every beat adds something:** a new fact, step, stake, proof, reaction or emotion. Use the A-to-C test: if cutting beat B from A-B-C loses no meaning and no needed emotion, B is a trim candidate [CA: lesn_7APOUz72vgBXT8ds5sN1N5 @ 02:05:25] [CA: lesn_8dKTdjJTFkaB6 @ 00:25:59].
- **Cut filler and transition phrases.** Greetings, warm-up openers that announce the video instead of starting it, and stock bridge phrases between points in the second half make a video feel longer than it is [CA: lesn_j39z3USSVGmb9 @ 00:59:35] [CA: lesn_rbBYE83jn1IOV @ 01:00:44] [CA: lesn_fHwZTPogxhj7v @ 00:50:53].
- **End a segment once its point lands**; anything after the viewer has understood is tail [CA: lesn_iRdPoMpJQ92BX @ 00:50:23]. Skip transitional footage and jump to the action [CA: lesn_FB9xS3RdC8spL @ 00:07:34].
- **A dragging but necessary sentence gets visual support; an unnecessary one gets cut** [CA: lesn_62cCxwbRjoC2W @ 00:49:10].
- **Show the proof where it is referenced.** Relevant work, process or a screenshot at the moment the claim is made explains and substantiates it; arbitrary stock B-roll does not [CA: lesn_L5GcOQcft5QqM @ 00:09:30]. When B-roll helps, bring it in early rather than after a long talking stretch [CA: lesn_KMK5xa0EMoo4H @ 00:18:41].
- **Attention resets are allowed, not required.** A mid-video re-hook line or a sentence built so the viewer must wait for its second half can keep a slower piece moving [CA: lesn_iRdPoMpJQ92BX @ 00:38:36] [CA: lesn_Rvzrje06xQob6 @ 00:50:21]. Repeated teaser interruptions that keep postponing the answer are padding [CA: lesn_9Ki3nRw1LJ8kq @ 00:28:08].
- **Rhythm is intentional.** Keep a coherent rhythm and change it when the tone or story changes; a longer beat is fine when it delivers humor, tension, comprehension or a breath [CA: lesn_6uS3Cka9DIsSNAmTo5GlrM @ 00:59:09] [CA: lesn_7i9GyapGUm0nA @ 00:09:20]. Change angle at the end of a complete thought, not on a timer [CA: lesn_7APOUz72vgBXT8ds5sN1N5 @ 02:06:38].

The facts pass gives two proxies here: `longestQuietStretch` (the longest run of scenes with no new VO or on-screen words) and per-scene `newWords` / `wps`. They locate candidates; the review decides whether the visual beat carries new information on its own.

## Step 5: payoff

- **Name the payoff** (teaching, demonstration, reveal, humor, an emotional turn) and check it fulfils the exact promise the hook made [CA: lesn_f8qGqPCtYoGBH @ 00:12:55]. An instructional promise needs instruction; an announcement need not become a tutorial.
- **Suspense pieces build to the outcome** instead of spending the climax before the journey. This is not an instruction to withhold a useful answer in a teaching piece [CA: lesn_33rLLgidKndey @ 00:49:46].
- **The ending matters as much as the hook.** End on a strong or vulnerable moment rather than letting the piece trail away [CA: lesn_fHwZTPogxhj7v @ 00:44:20] [CA: lesn_EsWMeOOBjYiWY @ 00:16:01].
- **Loop-back is one way to close, not a requirement.** Returning to the opening question at the end gives a question-led piece a sense of completion [CA: lesn_iRdPoMpJQ92BX @ 00:39:52]. Rewatch value comes from a quick payoff that is satisfying but still puzzling [CA: lesn_SqD1vtmT6gAPQ @ 00:46:22]. Fast text can invite a rewatch at the end, never at the start where the premise must land [CA: lesn_EsWMeOOBjYiWY @ 00:19:53]. The facts pass reports `loopBack.echoesOpening`; a piece without a loop is not weaker for it.

## Step 6: the next step fits the job

- **A call to action is optional.** Ending right at peak value with no ask is a valid choice, especially when the job is reach or trust; selling content should point to the lead magnet, site or form [CA: lesn_f8qGqPCtYoGBH @ 00:15:21].
- **Placement depends on the job.** A follow ask placed before the payoff worked in one demonstration format; value-first sales asks belong after the value; a comment-driven piece benefits from a short path from hook to ask [CA: lesn_RKxXyP6sSABib @ 00:12:38] [CA: lesn_L6bwAL7okepuc @ 00:38:13] [CA: lesn_v9cQsywtQ1qmC @ 01:02:36]. Read `cta.startPct` and `cta.askCues` against the job, not against a fixed slot.
- **The ask follows naturally from what was delivered** and is specific: a resource ask names the actual thing received [CA: lesn_iRdPoMpJQ92BX @ 00:21:16] [CA: lesn_DTzvocUoQ0UGx @ 00:25:32] [CA: lesn_rbBYE83jn1IOV @ 00:22:27].
- **Match the strength to readiness.** A repeated hard pitch to a warm audience fatigues it; a soft hand-raise or a useful question may fit better, while paid conversion usually needs an explicit ask [CA: lesn_HZnMjPAXDwOU9 @ 00:09:38].
- **A follow ask needs visible repeat value** (a series, a recurring promise) that this installment itself delivers [CA: lesn_lLECnECbVjZtn @ 00:10:55].
- **Paid ads are a different case:** qualify the intended viewer early, give the value, then ask clearly [CA: lesn_3T9uoAPX78Uqc @ 00:05:39] [CA: lesn_bv82Li2HmsXj5 @ 00:31:16].
- **Shareability is a motive, not a metric.** Name who the viewer would send it to and why [CA: lesn_dyWgJpf6Yv01K @ 00:38:24].

## Step 7: visual presentation pass

Assess each dimension separately, even when the verdict is "keep". For a script, judge the planned choice and mark execution unassessed. For AI-generated work, continuity of the character's face, wardrobe and props across scenes is the most common failure.

| Dimension | Inspect | Anchors |
|---|---|---|
| Setting / background | Does the environment belong to the subject and support the job? An intentional background can add interest; a quiet one may serve instruction better | [CA: lesn_ind8Fi53r3T3j @ 00:48:24] [CA: lesn_SqD1vtmT6gAPQ @ 00:07:39] |
| Clothing / character styling | Contrast with surroundings, freedom to show the action, consistency with the scene. Never infer competence from clothes | [CA: lesn_01NvK6khHjbtR @ 00:12:49] [CA: lesn_5Yx49Buee92JY @ 00:04:43] |
| Props / work context | Relevant tools and materials, actually used, with the needed detail visible | [CA: lesn_L5GcOQcft5QqM @ 00:09:30] |
| Lighting / framing | Face and action visible, room left for text and the platform UI | [CA: lesn_KMK5xa0EMoo4H @ 00:17:05] |
| Continuity | Wardrobe, props, location, light and direction match across cuts that imply one moment; a replacement take matches the original | [CA: lesn_7APOUz72vgBXT8ds5sN1N5 @ 03:29:03] |
| On-screen text | Accurate, readable at its dwell time, styled to the tone, placed around the action; viewers will not rewatch to decode the premise | [CA: lesn_EsWMeOOBjYiWY @ 00:18:00] [CA: lesn_Cx3NXX0fMsWKf @ 00:07:33] [CA: lesn_EsWMeOOBjYiWY @ 00:29:27] [CA: lesn_01NvK6khHjbtR @ 00:39:00] |

Separate a **repair** (an observed clarity problem), a **strengthen** (better fit for the chosen job) and an **experiment** (an optional aesthetic choice). Do not nitpick grooming or demand perfection that prevents output [CA: lesn_4YEASQOIfGMbWK3wYYGCzY @ 00:49:31].

## Context rules: what the course does not prescribe

These are the places a rigid linter would contradict the source. Apply them before turning any number into a verdict.

- **No universal cut interval or cuts-per-second.** Change the shot when a thought completes or the emphasis moves; a continuous educational shot can be the better choice [CA: lesn_7APOUz72vgBXT8ds5sN1N5 @ 02:06:38] [CA: lesn_6uS3Cka9DIsSNAmTo5GlrM @ 01:20:06]. The counterweight: in speaker-led pieces, more frequent visual change often helps [CA: lesn_EsWMeOOBjYiWY @ 00:35:49]. Judge whether each stretch earns attention, not the cut count.
- **No ideal duration.** Length is whatever delivers the idea completely and engagingly; do not stretch a good short piece and do not cut a qualifying long one for runtime alone [CA: lesn_vnCkLaM2HbB7O @ 00:39:59] [CA: lesn_4YEASQOIfGMbWK3wYYGCzY @ 00:08:29] [CA: lesn_fMycOsjH8W3FB @ 00:39:08]. Longer can work if it feels short [CA: lesn_l47ITl9iOhaHL @ 00:09:08]; beginners are advised to master shorter pieces first and to condense aggressively [CA: lesn_ngIMsrryyWOgh @ 00:20:24] [CA: lesn_9Ki3nRw1LJ8kq @ 00:09:50]. A remark that very short clips may underperform is an observation, not a floor [CA: lesn_FB9xS3RdC8spL @ 00:20:37].
- **No fixed hook duration or word count.** One lesson recommends longer, scripted hooks that run well past a few seconds; another warns that long intros drag in talking videos; another adds a beat when the reveal is too fast [CA: lesn_pbdzLEVqX7oNN @ 00:42:50] [CA: lesn_rbBYE83jn1IOV @ 00:59:42] [CA: lesn_V6DvbBMxhkXvg @ 00:02:36]. Judge whether the opening does its job at its speed.
- **Captions are usually helpful, not mandatory.** Captions are the default recommendation, but raw, intentionally captionless pieces can work [CA: lesn_vnCkLaM2HbB7O @ 00:41:53] [CA: lesn_7APOUz72vgBXT8ds5sN1N5 @ 00:10:33] [CA: lesn_33rLLgidKndey @ 00:24:27]. Text style should match the tone, from small and restrained to big and loud [CA: lesn_EsWMeOOBjYiWY @ 00:29:27].
- **No CTA on every post.** See Step 6; an explicit ask is not a quality requirement for organic reach or trust content [CA: lesn_f8qGqPCtYoGBH @ 00:15:21].
- **No mandatory music or mix percentage.** Casual speech can run without music; when music is used, its most engaging section belongs early in a short piece; editor volume percentages are not loudness standards [CA: lesn_6uS3Cka9DIsSNAmTo5GlrM @ 00:36:22] [CA: lesn_V6DvbBMxhkXvg @ 00:16:17] [CA: lesn_iRdPoMpJQ92BX @ 00:12:34].
- **Retention numbers are relative.** Read a retention percentage together with the video's length; a lower percentage on a longer piece can beat a high one on a very short piece [CA: lesn_9Ki3nRw1LJ8kq @ 00:30:56].
- **Platform and algorithm claims are dated hypotheses** (save and share weighting, packaging tricks, distribution rituals). Never present them as current platform behavior without separate evidence [CA: lesn_f8qGqPCtYoGBH @ 00:27:34] [CA: lesn_19eLHNiFVibysNTLv1eUaw @ 00:34:55] [CA: lesn_1ClCRFCYKvOsulzV18cxnr @ 00:56:25].
- **Never fabricate proof.** No invented testimonials, results, urgency or "spontaneous" reactions to make a piece stronger.

## Statuses, priority, confidence

Give each applicable dimension (job fit, hook, one idea, development, payoff, next step, each visual dimension) one status:

- **strong**: evidence clearly fulfils it for the chosen job.
- **mixed**: a real strength and a concrete friction in the same dimension. Not a polite word for weak.
- **weak**: an observed problem materially conflicts with the job.
- **unassessed**: relevant, but the needed modality is missing (audio from a script, pacing from stills).
- **n/a**: outside this job or format; say why in one clause.

Label each finding **P0** (contradicts or fails the piece's central job), **P1** (materially weakens the premise, opening, progression, proof or action), **P2** (a local clarity or craft defect), or **Experiment** (a plausible alternative with no established defect). Give confidence (high / medium / low) and name its evidence. Consolidate shared causes into one repair, and do not let small wins average away an undelivered promise. Fix the biggest obstacle first rather than a long list of simultaneous changes [CA: lesn_rbBYE83jn1IOV @ 00:55:01].

Default to statuses, not a score. If the user asks for a number, score only assessed criteria (strong 2, mixed 1, weak 0), report `100 * points / (2 * assessed)` with the assessed/applicable count beside it, and call it an editorial consistency score, never a virality prediction.

## Writing the review file

`RETENTION_REVIEW.md` (pre-render) or `RETENTION_REVIEW.post-render.md` (post-render), in English, with these sections:

1. **Verdict**: one or two sentences: the recommended job and the single biggest obstacle in that role.
2. **Evidence**: what was inspected, what is unassessed.
3. **Facts**: the `retention-check` numbers that matter, each with a one-line reading.
4. **Job fit**: discovery / trust / inquiries / sales / update, as relevant.
5. **Hook**: spoken, text, visual, combined, handoff, with status.
6. **One idea**, 7. **Development**, 8. **Payoff**, 9. **Next step**: status plus findings.
10. **Visual presentation**: one line per dimension.
11. **Top fixes**: the three most consequential repairs, then every other supported finding as a list: where (scene id or timestamp), problem, action (KEEP / CUT / SHORTEN / MOVE / REWRITE / RESHOOT / TEXT / INSERT / MIX / VERIFY), priority, anchor.
12. **Keep**: what works and must survive the rewrite.

Rules for the file: cite anchors, never quotes; no invented analytics or outcomes; keep uncertainty local to the claim. In the pre-render pass the scenarist may rewrite VO afterwards through the normal feedback loop ([feedback-iteration.md](./feedback-iteration.md)); the review itself says what must change and why, and leaves the new lines to that step. A pre-render review that disagrees with `ralphy project score` is shown to the user with the storyboard; the user decides which wins.

## Where this disagrees with docs/virality-rubric.md

The rubric (and [pacing.md](./pacing.md)) encodes short-ad craft defaults calibrated on 15-second commerce clips. The course treats most of those as context-dependent. Use the rubric numbers as defaults for the format they were tuned on; use this method to decide whether a deviation is a defect.

| Rubric position | Course position | How to apply |
|---|---|---|
| Hook must land in the first 1-3 s; the first 3 s carry all the weight | The hook is the whole opening statement; its length depends on the job and pace | Report the hook end and promise cue; judge whether the opening does its job, not its seconds |
| Hook line at most 10 words | No word cap; the opening must be understandable at the speed it is presented | Flag a hook only when it is unreadable or delays the point |
| Default 10-15 s; above 15 s needs justification | Length is whatever delivers the idea; long can work if it feels short | Judge every stretch for whether it earns its time |
| No scene over 3 s without a cut; beats average 1-2 s | No universal cut interval; a continuous shot can be the better choice | Treat long beats as review candidates, not failures |
| Loop-friendly ending is the top completion tier | Looping back is one completion device among several | Report `loopBack`; do not penalize its absence |
| Word-by-word pop-up captions for retention | Captions usually help comprehension; omission and restrained styles are valid | Judge text by readability and tone fit |
| CTA or loop in the last 2 s | A CTA is optional and its placement depends on the job | Read `cta.startPct` against the job |
| Music ducked to 0.6-0.8 | No mandatory music; mix numbers are not loudness standards | Judge intelligibility and mood by ear |

Where the two agree (the hook must earn attention, every beat should move the piece, text must be readable, a reason to share helps), there is nothing to reconcile.
