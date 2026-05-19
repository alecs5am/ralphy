# Hooks — Broadcast Caught-On-TV (Square)

This template is one-clip and 15 seconds long. The hook IS the first 2 seconds. Get them wrong and the scroll continues; get them right and the viewer is locked in for the recognition payoff at 3–6s.

The 0–2s patterns below are NOT separate clips — they're the opening half-beat of the single Kling generation. Encode them as the `0-3s` window of the beat-by-beat timeline in the video prompt.

## The two hook archetypes that work

### 1. "Live broadcast tease" — the camera is already rolling on the venue

The first 1–2s shows the venue / event in motion BEFORE the camera cuts to the subject. Sells the "this is a real broadcast" frame.

```
- 0-1s wide ambient pan of the {{venue_dressing}} — crowd in motion, no subject
  yet. Broadcast-graphics lower-third visible. {{broadcast_channel}} watermark
  in corner.
- 1-3s camera cuts / pushes in to the subject, who is mid-{{subject_pose}},
  unaware. Subtle broadcast-camera shake on the push.
```

When to use: any sports / awards / news broadcast where the audience is part of the show (KBO, NFL halftime cutaway, Wimbledon centre-court audience, Eurovision crowd).

Why it works: the half-second of venue context BEFORE the subject appears short-circuits the "AI-generated face" instinct. By the time the viewer sees the face, they've already accepted the frame as a broadcast.

### 2. "Camera-cut-to-crowd" — abrupt cut, subject already on screen

The first frame IS the subject. No tease, no pan-in. The cut feels like a director hit a button in the production truck.

```
- 0-2s subject already in frame, {{subject_pose}}, immediately recognizable.
  Slight broadcast camera shake holds. Ambient venue audio already playing at
  full level — no audio fade-in.
- 2-5s subject's reaction beat begins (notice camera, blink, micro-expression).
```

When to use: kiss-cam / jumbotron-cam moments (the format depends on suddenness); news vox-pop cuts; any moment where the joke is "this is the moment they got caught".

Why it works: removes any setup time the viewer could use to detect AI. The compressed-broadcast-quality + ambient-audio + on-screen-graphics combo lands instantly.

## What does NOT work as a hook

- **Slow fade-in from black** — instantly reads as edited content, not a live broadcast.
- **On-screen text overlay in the first 1s** ("POV: caught on TV") — kills the realism. If you must add a caption-style overlay, sequence it at 3–6s to land AFTER the recognition beat.
- **Music swell on the cut** — broadcasts don't do this. Diegetic audio only.
- **Centered tight close-up of the subject** — broadcast audience-cams almost never frame this tight. Mid-shot with venue context behind the subject is the canonical framing.

## Hook + structure quick reference

| Slot | 0–2s (hook) | 2–6s (recognition) | 6–15s (beat-of-life) |
|---|---|---|---|
| Sports audience-cam | Live broadcast tease | Subject notices camera | Sip / laugh / clap / look back |
| Kiss-cam / jumbotron | Camera-cut-to-crowd | Realize they're on the jumbotron | Embarrassed reaction → settle |
| Red-carpet cutaway | Camera-cut-to-crowd | Flash-pop reaction | Adjust hair / sip drink / pivot |
| News vox-pop | Live broadcast tease (b-roll of street) | Subject mid-sentence | Continue → small pivot beat |
| Eurovision audience | Live broadcast tease (flag wave) | Subject sings along | Cheer with neighbours |

Encode the chosen archetype as the explicit `0-3s` line in the Kling prompt — see `prompt-cookbook.md`.
