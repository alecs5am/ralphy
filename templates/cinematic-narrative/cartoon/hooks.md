# Cartoon hooks — the 2-second opening

Every cartoon i2v clip needs one hard visual pop in the first 0.5-1.5 seconds. The opening 48-60 frames are what stop the scroll. Pick exactly one of the hooks below per clip and bake it into the keyframe prompt + motion brief. Stacking two hooks usually muddies the frame; stacking three always does.

All examples are designed to work with `gemini-3-pro-image-preview` for keyframe + `kling-v3.0-pro` i2v for motion. They strip cleanly across every cartoon sub-style (Disney, Cartoon Network, flat vector, rubber hose, watercolor, neon, manga, claymation).

---

## Hook 1 — Character Smash-Zoom

**Setup.** The protagonist or focal object rockets into the camera plane with extreme scale change and a single-frame impact pose. Eyes bulge, mouth opens, motion blur trails behind.

**Why it works.** Scale change is the single most attention-grabbing visual signal. The viewer's pre-attentive system reads "thing rushing at me" before any conscious processing — they cannot scroll past.

**Keyframe prompt fragment.**
> "Character mid-flight smash-zooming into camera, eyes bulging cartoonishly large, mouth wide open, body stretched along motion vector, motion blur trails behind. Background recedes in radial blur. Style: [primary style]."

**Motion brief.** "Rapid zoom-in over 0.4s, character body stretches along Z-axis, single 1-frame impact hold at peak scale, then 2-frame settle into neutral pose."

---

## Hook 2 — Rubber Hose Stretch Entrance

**Setup.** Character enters by stretching limbs across the entire screen — arm reaches in from off-frame, body follows in a sinuous taffy-pull, snaps back into normal proportion at center frame.

**Why it works.** Impossible motion screams "this is animated." Sets the rules of the world (physics-defying) inside the first second so everything after is permitted.

**Keyframe prompt fragment.**
> "Character mid-stretch entering frame from screen-left, arm extends 3x normal length in sinuous curve, body follows in elastic taffy-pull, head hasn't caught up yet. Bold outlines, classic rubber-hose proportions."

**Motion brief.** "Limb stretches across screen over 0.5s following S-curve path. At center, body snaps into normal proportion with overshoot wobble. Volume preserved throughout — wider means shorter."

---

## Hook 3 — Color Explosion

**Setup.** A burst of saturated color, sparkles, or radial gradient floods the frame from a single focal point. Character or product appears at the convergence.

**Why it works.** High-saturation color burst against any darker baseline is the strongest possible "thumbnail moment" — designed for feed legibility.

**Keyframe prompt fragment.**
> "Radial color explosion centered on subject, hot magenta and electric yellow sparkle bloom radiating outward, motion lines suggesting outward energy. Subject silhouetted at convergence point."

**Motion brief.** "Burst expands radially from center over 0.3s, sparkles cascade outward and dissipate, subject becomes clearly visible as burst fades, hold cleanly at 0.6s."

---

## Hook 4 — Fourth-Wall Break

**Setup.** Character freezes mid-action, slowly turns head to camera, holds direct eye contact, gives a knowing wink or conspiratorial grin.

**Why it works.** Direct eye contact is biologically impossible to ignore. Cartoon eye contact is more permissible than photoreal, so the wink lands as charm not creepiness.

**Keyframe prompt fragment.**
> "Character paused mid-stride, head rotated 90 degrees to camera, looking directly into lens with raised eyebrow and conspiratorial grin. One eye narrowed in mid-wink. Other elements of scene held in static gesture."

**Motion brief.** "Character action freezes at 0.2s, head rotates to camera over 0.3s with slow easing, hold direct gaze 0.5s, single 2-frame wink, return to scene action."

---

## Hook 5 — Exaggerated Reaction Face

**Setup.** Massive facial deformation. Eyes pop wide as dinner plates, mouth stretches into silent scream, eyebrows shoot up, entire face contorts. Held for 0.3-0.5s for comedic timing.

**Why it works.** The most universal cartoon language — every viewer reads "shocked face = comedy" instantly. Extreme expression buys 0.5s of held attention with no narrative burden.

**Keyframe prompt fragment.**
> "Extreme close-up on character's face mid-shock-reaction. Eyes are massive perfect circles taking up half the face, pupils tiny dots in center. Mouth stretches into wide O-shape, jaw dropped impossibly low. Eyebrows arched high above the head outline."

**Motion brief.** "Neutral face for 0.1s, then snap to maximum-shock expression in single frame, hold 0.3s with motion lines radiating outward, then 0.2s decay back through subtler expressions."

---

## Hook 6 — Object Transforms Unexpectedly

**Setup.** A background element or prop shifts shape mid-shot — cloud becomes a bird, ground waves like water, wallpaper pattern crawls. Sets a surreal-whimsical world.

**Why it works.** Breaking the rule that "background is static" recruits the entire frame as active visual surface. Especially powerful for whimsical / Ghibli / surreal sub-styles.

**Keyframe prompt fragment.**
> "Wide scene with character at center, background cloud mid-transformation into bird silhouette — cloud shape stretching, edges feathering, wing forms emerging. Character continues normal action, oblivious."

**Motion brief.** "Background element morphs over 1s with smooth liquid transition. Character's primary action continues uninterrupted. Final shape resolves cleanly by 1s mark."

---

## Hook 7 — Speed Line Burst

**Setup.** Curved manga-style speed lines explode radially from behind a fast-moving character. Trail effect on the figure itself with motion-blur smear.

**Why it works.** Nonverbal "fast" signal lifted directly from manga — the viewer parses speed without parsing the action. Pairs perfectly with rapid spin, dash, or punch motion.

**Keyframe prompt fragment.**
> "Character in dynamic action pose at center, dense radial pattern of curved speed lines exploding outward from behind subject. Body trailed by motion-blur duplicates. High-contrast monochrome speed-line treatment against bold color background."

**Motion brief.** "Character rapid action over 0.4s with 3-frame motion-blur duplicate trail, speed lines burst outward from origin point and remain visible 0.5s before fading."

---

## Hook 8 — Particle Shower / Confetti Cascade

**Setup.** Rainbow confetti, golden sparkles, hearts, stars, or coin shower cascades down or erupts upward from offscreen. Subject revealed through or after the shower.

**Why it works.** Celebratory frame language — works for product reveals, achievement moments, "tada" beats. Particle volume gives the eye a lot of motion to track in the first second.

**Keyframe prompt fragment.**
> "Frame filled with cascading rainbow confetti and golden sparkles falling from top-of-frame, subject visible through gaps in the shower at center. Confetti at varied scales for depth, slight blur on closer pieces."

**Motion brief.** "Particles cascade downward over 1s with subtle horizontal drift, gravity-eased. Subject becomes fully visible by 0.7s as foreground particles clear. Hold cleanly at 1s."

---

## Hook 9 — Blink / Cut-To-Black

**Setup.** Character's eyes slam shut, screen goes black for 1-2 frames, cut opens to a new angle, scene state, or transformation.

**Why it works.** Hard cut on a blink is a classic edit dressed up as character motion — the viewer accepts the discontinuity emotionally because it tracks with the character's experience.

**Keyframe prompt fragment.**
> "Character mid-action with eyes slammed shut tight, eyelids drawn as bold horizontal lines, slight squash on face from forceful blink. Background still visible but reading as 'about to disappear'."

**Motion brief.** "Eyes close hard at 0.3s, screen flash to pure black for 2 frames, cut open at 0.5s on new angle / new pose / new scene state. Character's eyes slowly reopen."

---

## Hook 10 — Gravity Flip / Environmental Inversion

**Setup.** Gravity reverses, objects float upward, character defies physics mid-motion. Floor becomes ceiling. Surreal-magic register.

**Why it works.** Physical-rule violation reads as "magic" and primes the viewer to accept anything in the rest of the clip. Strong opener for fantasy, dream, or transformation narratives.

**Keyframe prompt fragment.**
> "Character mid-air with body rotated to imply 'down' is now 'up'. Loose objects (papers, hat, small props) drifting upward with character. Floor reads as ceiling — light fixture above is now visually 'below'. Hair flows upward."

**Motion brief.** "Gravity reverses over 0.5s with smooth easing, character and loose objects all drift upward together, character expression shifts from neutral to delighted-surprise. Hold inverted state at 1s."

---

## Hook 11 — Squash-and-Snap Entrance

**Setup.** Character drops into frame from above, squashes flat on impact (40% vertical compression), then snaps back upright with overshoot wobble.

**Why it works.** Pure squash-and-stretch demonstration — instantly establishes "cartoon physics in effect" and sells character weight in two beats.

**Keyframe prompt fragment.**
> "Character compressed flat in squash pose at frame center, body 40% shorter and 30% wider than neutral, eyes squeezed shut, slight dust puff at impact. Background steady, character is sole motion focus."

**Motion brief.** "Character drops in over 0.2s, single-frame max squash on impact, rebound to 110% height (overshoot stretch) over 0.2s, settle to neutral over 0.3s with subtle wobble."

---

## Hook 12 — Title Card Pop-In

**Setup.** Animated text or logo bursts onto frame with bounce-in motion, scale wobble, and supporting particle/sparkle accent. Bold lettering style matched to the cartoon sub-style.

**Why it works.** The video's promise lands literally — viewer reads what they're about to watch in 0.8s. Strong choice for explainer, listicle, or branded-content openers.

**Keyframe prompt fragment.**
> "Bold display title 'TITLE TEXT' filling middle third of frame, lettering in cartoon-display font matched to primary style (heavy outline, drop shadow, color fill matched to palette). Sparkles or motion accents on letter edges. Plain or simplified background."

**Motion brief.** "Title scales in from 0% to 110% over 0.3s with bounce easing, settles to 100% with 2-frame wobble, sparkles burst on settle frame and dissipate over 0.4s."
