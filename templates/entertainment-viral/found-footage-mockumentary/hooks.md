# Hooks — found-footage-mockumentary

6 cold-open patterns for the 0-2s window. Found-footage mockumentary is uncommon in that the hook has to land WITHOUT a face on screen, WITHOUT a voice, and WITHOUT a stylized title slam — all three of which break the diegetic contract this template depends on. Every hook below is a diegetic act-of-recording that simultaneously functions as a pattern interrupt for the scroll.

> **Reminder.** Every hook lives inside the Hi8 register: REC dot top-corner, timecode burning, faint Hi8 grain, cold blue tonality, slight handheld micro-shake. If your first 2 seconds don't read as "this is a real amateur camera turning on right now", the spell is broken before the viewer commits.

## 1. The camera-on flash

> Black frame for 6 frames → harsh white-bloom flash → cold-blue Hi8 register snaps in → `REC ●` indicator appears top-left.

- **Setup.** First frame is pure black. The viewer's brain registers "did the video load? something's wrong." Then the white flash and Hi8 register hit at 0.2s.
- **Why.** Pattern interrupt: in a feed full of full-frame content, 6 frames of black reads as a tape-rewind moment. The white flash + REC indicator earns the viewer's attention by mimicking the act of turning a real camera on.
- **Diegetic justification.** The operator just powered the camcorder on / pressed record. Every overlay that follows (timecode, BAT %, captions) is implicitly justified by this hook.
- **Risk.** If the platform compresses the black frames into 1-2 frames of grey, the effect flattens. Render with a higher bitrate target for the first 0.5s.

## 2. The "is this thing recording" hand-wave

> POV of gloved hand swinging up into the lower frame, palm passing the lens at ~30cm distance, blurring as it goes — then settles → reveals {{cult_location_descriptor}} ahead.

- **Setup.** The operator is checking if the camera is on by waving their gloved hand in front of the lens. Lens auto-focuses on the hand for 0.4s, then focus pulls past it to the environment.
- **Why.** The hand-in-frame moment reads as "amateur recording, not produced content" instantly. Viewers who saw the hand do this in every Blair-Witch-era found-footage film get a Pavlovian "oh this is one of those" reaction.
- **Diegetic justification.** The operator is double-checking the camera. The {{handheld_persona}} characterization carries via the glove material (work-glove for hiker, latex for paranormal investigator, fingerless for urbex).
- **Risk.** If the hand looks AI-rendered (six fingers, melting glove texture, etc), the spell breaks immediately. This hook requires a clean glove generation — pass a user-supplied glove reference if you've shipped this template more than once.

## 3. The REC-dot blink-on

> Static black frame for 8 frames → `REC ●` indicator BLINKS ON top-corner (1 frame visible, 1 hidden, 1 visible — the classic 3-frame "blink-on") → cold-blue Hi8 register fades in over the next 4 frames.

- **Setup.** Pure black for ~0.27s. Then the REC indicator appears as if the camera display is booting. The Hi8 register stutters in 0.15s later.
- **Why.** Mimics the boot sequence of a real 1990s camcorder. Viewers who never owned a Hi8 still recognize the visual grammar from horror films.
- **Diegetic justification.** Camcorder is booting. Every overlay justified.
- **Risk.** The blink-on must be SHARP (1-frame visible / 1-frame hidden / 1-frame visible). If you smooth it into a fade-in, it reads as a stylized title card.

## 4. The "what the fuck is that" focus-pull

> Cold open: in-focus tight on a foreground branch / fern / windowsill → lens slowly racks focus past it to reveal something orange-flickering in the deep background → REC dot pops on top-corner at the moment focus locks.

- **Setup.** Foreground is fully in focus, background is bokeh blur. As focus pulls, the bokeh resolves into a distant fire / window light / cult clearing.
- **Why.** Lens-mechanic-as-narrative. The viewer's attention is initially anchored to a banal foreground element, then dragged to the dread object by the operator's lens. Engages the same "what am I supposed to be looking at" reflex that horror trailers exploit.
- **Diegetic justification.** Operator is focusing the camera manually because the auto-focus is hunting.
- **Risk.** seedance-2.0 sometimes over-smooths focus-pulls into cinematic dolly-zoom territory. Explicitly prompt "rack focus mechanical, not cinematic dolly-zoom — slight focus hunting".

## 5. The timecode glitch

> `REC ●  AUG 15 2003 23:47:XX  · BAT 14%` HUD already burning → timecode briefly stutters / scrambles (1 frame of garbled digits) → re-stabilizes → reveals the operator is mid-stride.

- **Setup.** The video starts with the HUD already in place, as if we're joining an in-progress recording. The timecode hiccup creates a momentary "is the file corrupted" pattern interrupt.
- **Why.** Suggests the tape has artifacts, which both validates the "this is found footage" premise AND foreshadows the catastrophic signal-loss at the climax. Promise → payoff in the same 40s cut.
- **Diegetic justification.** Tape mechanical glitch — common in real Hi8 footage from the era.
- **Risk.** The stutter must be sub-second. A longer glitch reads as a stylized title-card animation and breaks the diegetic rule.

## 6. The mid-sentence caption

> Cold open: operator already walking through {{cult_location_descriptor}} → lower-third caption fades in mid-thought: "...trail behind the lake" (with the leading "..." present, suggesting we joined mid-sentence) → 2 seconds later caption fades out.

- **Setup.** The viewer joins the recording in progress. The caption uses an em-dash or ellipsis to mark that this isn't the first frame the operator captured — just the first frame the platform is showing us.
- **Why.** Promise that there's more context off-frame. Engages the "I missed something — let me watch from the top" loop that drives re-watches.
- **Diegetic justification.** Captions are platform-added (the publisher cut the original 8-minute tape down to 40s for TikTok). The ellipsis makes that visible.
- **Risk.** The caption must be in `{{target_language}}` and read as plausible-amateur (no ALL CAPS, no emojis, no kinetic typography). Plain sans-serif, lower-third, fades not slides.

## Picking a hook

| Audience expectation | Best hook |
|---|---|
| Genre-fluent horror viewers (TikTok #analoghorror tag) | #1 camera-on flash or #3 REC-dot blink-on |
| Casual scrollers, low genre context | #2 hand-wave (the hand-in-frame is unmistakable) or #6 mid-sentence caption |
| Algorithm-optimized for high retention | #4 focus-pull (longest dwell on initial frame = better feed signal) |
| Self-referential / meta horror audience | #5 timecode glitch (foreshadows the climax in act 1) |

Don't stack two hooks. Pick one diegetic act-of-recording, commit to it for 0-2s, then move to the approach beat.
