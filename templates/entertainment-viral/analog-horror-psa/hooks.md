# hooks — analog-horror-psa

0-3s cold-open patterns. The hook in this format is NOT a catchy line — it's a register-shift the viewer's brain has to resolve. "Wait, is this a real emergency broadcast?" is the question that has to fire by 0.8s for the scroll to stop.

Five proven patterns. Source project (analog-horror-fridge-001) used pattern A.

## A — EBS Title Card (source-project hook)

```
0.0s  HARD CUT to dark textured #0a0a0a background, no transition.
0.0s  Red EBS-style title card slams in: bold {{subject_warning_id}} characters
      (e.g. "9-D"), red horizontal bars top + bottom. Center-frame, ~70% size.
0.0s  Static-rise SFX (~120ms) — the analog "channel switching" sound.
0.0s  EBS three-tone alert sting (the classic harsh attention signal).
0.2s  Glitch flicker: card jitters +16px / -16px / center over 200ms.
0.6s  Second glitch flicker. Card "lands" in place.
0.8s  VO begins: "Compliance bulletin {{bulletin_id}}."
1.5s  VO finishes. Static hiss bed continues.
2.5s  Caption baked: "COMPLIANCE BULLETIN {{SUBJECT_WARNING_ID}}".
3.0s  HARD CUT to scene-02 setup.
```

Why it works: the EBS three-tone sting hijacks the viewer's "this is official" reflex. By the time they realize it's a Short, they've already invested 0.8s.

## B — Color-bar cold-open (alt — opens AT signal-lost, fakes a "you just tuned in")

```
0.0s  Full-screen SMPTE color bars (cyan / green / magenta) + bottom strip,
      with filter: blur(2.5px) + tracking-band sweep + chromatic-aberration ghost.
0.0s  Monotone 1kHz signal-lost tone, full volume.
0.5s  HARD CUT to dark textured bg + EBS title card.
0.6s  VO begins.
```

Use when you want the viewer to feel "this video pre-existed and I dropped into it." More disorienting than A. Lower hook-clarity score on virality rubric but higher rewatch potential.

## C — Pure-black cold-open with VO-only first line

```
0.0s  Pure #000000 fill. No icon, no overlay.
0.0s  Static-pop SFX.
0.2s  VO begins (cold robo-female): "Compliance bulletin {{bulletin_id}}."
1.5s  VO finishes.
1.8s  Yellow setup-icon fades in (the entity in its calm pose).
2.0s  Caption baked: "RESIDENTIAL BEHAVIORAL ALERT".
3.0s  Continue into setup.
```

Use when {{subject_warning_id}} is hard to render as a graphic (e.g. it's a word, not a code). Slightly slower hook engagement but maximum mystery.

## D — Tracking-glitch cold-open (mid-bulletin fake-in)

```
0.0s  Heavy VHS tracking glitch — full-screen distortion bars + chromatic-aberration
      spike + caption fragment ("...BEHAVIORAL ALERT IF YOUR {{subject_warning}}...")
      mid-sentence, mid-glitch.
0.3s  Glitch resolves to clean dark bg.
0.4s  EBS title card slams in.
0.8s  VO begins from the top: "Compliance bulletin {{bulletin_id}}."
3.0s  Continue.
```

Use to imply the viewer "caught" the bulletin mid-broadcast — feels found-footage. Strongest pattern for "is this real?" hook fire.

## E — Anti-pattern hook (DO NOT USE — included for negative reference)

```
0.0s  "POV: government tells you to..." or any TikTok-meme-format caption.
0.0s  Whip-zoom into the icon.
0.0s  Music swell.
```

This is the failure mode. The format works because the viewer cannot tell if it's a real broadcast for the first 1-2 seconds. Adding TikTok-meme captions, whip-zooms, or music swells kills that ambiguity instantly. If your hook needs these, ship a different template (try `brainrot-ai-meme` or `tier-list`).

## Hook checklist

Before committing the hook, verify:

- [ ] First 0.8s has NO TikTok-meme cue (no "POV:", no "wait for it", no whip-zoom)
- [ ] No music in first 0.8s (SFX only — static, EBS sting, signal-lost tone)
- [ ] VO does not start before 0.5s (let the SFX establish the register first)
- [ ] First VO line is the bulletin ID or the alert framing (NOT the {{subject_warning}})
- [ ] If a caption fires in 0-1s, it's in VT323 + yellow + chromatic split (not a regular TikTok caption)
- [ ] The 5-layer chromatic split is active from frame 0 (not introduced later)
- [ ] The VHS-hiss bed starts at 0.0s and continues unbroken

If any of these check items is wrong, the format breaks register and the viewer recognizes "this is a video" before "this is a bulletin." The conversion drops.
