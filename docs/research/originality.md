# Originality and duplicate risk: platform rules, matching, and Ralphy's check

**Issue #561.** Research date: 2026-10-30. Policy pages were read on that date; claims
that came only from news or creator blogs are marked as such. Measured numbers come from
the synthetic near-duplicate set in `tests/helpers/synthetic-media.ts`.

**Scope.** This note is about making variants that are genuinely different and knowing
when output would count as a duplicate or reused content. It is not a guide to passing
the same video through duplicate detection. The policies below do not depend on whether
a hash matches: they judge what a post adds.

## Summary

- All three platforms reduce distribution (and on monetized programs, payouts) for content
  that reuses existing material without adding something new. None of them treat speed
  changes, borders, watermarks, or similar trivial edits as adding something new.
- Matching is done on pictures and sound. Meta has open-sourced its perceptual hashes
  (PDQ, TMK+PDQF, vPDQ), YouTube's Content ID matches audio and visual references, and
  production systems have moved to learned copy-detection descriptors trained on exactly
  the cosmetic edits people use (mirror, crop, grade, speed, overlays).
- The claim that mirroring, 1.1-1.2x speed, a LUT, or a crop beats detection comes from
  creator and SEO blogs only. No primary source supports it, and Meta's own benchmark found
  speed changes among the easiest edits to catch.
- So Ralphy plans variants by **substance** (new hook, new VO, re-edit, new B-roll, new
  layout or format) and treats cosmetic transforms as an optional last layer that never
  counts. `ralphy unit originality` measures what a piece reuses; the variant tournament
  refuses a sibling that still reads as a duplicate.

## Platform policies

### TikTok

- The Community Guidelines section on integrity and authenticity (current version released
  2026-08-25, in force 2026-09-24) makes unoriginal or reused material that adds nothing new
  ineligible for the For You feed: it stays up but is not recommended. Reposts that infringe
  intellectual property are removed.
  [Integrity and authenticity](https://www.tiktok.com/community-guidelines/en/integrity-authenticity),
  [For You feed standards](https://www.tiktok.com/community-guidelines/en/fyf-standards).
- The Creator Rewards Program pays for original videos longer than one minute and scores
  originality as one of its quality signals.
  [Newsroom, 2024-03-18](https://newsroom.tiktok.com/introducing-the-new-creator-rewards-program).
- Not verified on a primary page: that Duets and Stitches are excluded from rewards, that
  filters or speed changes alone are listed as not original, and that other-platform
  watermarks trigger flags. These appear only in creator and seller blogs.

### Instagram

- Since the 2024-04-30 ranking change, recommendations show the original post in place of
  reposts, reposts get a label linking to the original, and aggregator accounts lose
  Reels recommendations. Secondary source:
  [Engadget](https://www.engadget.com/instagrams-algorithm-overhaul-will-reward-original-content-and-penalize-aggregators-130018977.html).
- The 2026-04-30 expansion covers photos and carousels too. An account that mainly posts
  other people's work loses recommendation eligibility across the app and regains it once
  most posts in a rolling 30-day window are original; status is visible in Account Status.
  [Instagram creators blog](https://creators.instagram.com/blog/rewarding-original-creators-on-instagram),
  [TechCrunch](https://techcrunch.com/2026/04/30/instagram-restricts-reach-of-content-aggregators-in-new-crackdown/).
- The Original Content Guidelines count as original what you captured or designed, or
  third-party material you changed substantially (commentary, new context, voiceover).
  They explicitly list borders, watermarks, speed changes, subtitles, caption credits, and
  screenshots as not enough. The test they give: if removing your contribution leaves the
  post nearly the same, it is not original.
  [Original Content Guidelines](https://creators.instagram.com/original-content-guidelines/).

### Facebook (Meta)

- The 2025-07-14 announcement: accounts that repeatedly repost others' videos, photos, or
  text without permission or meaningful enhancement lose monetization for a period and get
  reduced distribution on everything they post. Duplicate videos get reduced distribution,
  and Meta tests linking copies to the original. Creative editing, voiceover, commentary,
  reactions, and a trend with your own take count as meaningful; stitching clips together
  and adding your own watermark do not.
  [Meta for Creators](https://creators.facebook.com/blog/combating-unoriginal-content).

### YouTube

- The YouTube Partner Program's reused-content rule covers repurposing others' content
  without significant commentary, real edits, or added value. It is judged across the
  channel, and permission from the owner does not fix it. Examples that are fine:
  critical reviews with clips, reactions with spoken commentary, edits that tell a new
  story. Examples that are not: low-narrative compilations, reposts from other platforms,
  copies with trivial changes, and songs changed only in pitch or speed.
  [YPP monetization policies](https://support.google.com/youtube/answer/1311392).
- On 2025-07-15 the "repetitious content" rule was renamed "inauthentic content": mass-
  produced or template videos with minimal variation. A consistent series format is fine
  when each video is distinct. This is the rule a content farm of near-identical variants
  would hit even when every variant is its own footage. Secondary:
  [Search Engine Journal](https://www.searchenginejournal.com/youtube-clarifies-monetization-update-targeting-spam-not-reaction-channels/550123/).
- Content ID: rights holders upload references (audio-visual, audio-only, or visual-only),
  every upload is scanned against them, and match policies set the match type, a minimum
  matched length or share, and the action (block, monetize, track).
  [How Content ID works](https://support.google.com/youtube/answer/2797370),
  [Match policies](https://support.google.com/youtube/answer/107129).

## How duplicates are matched

- **Perceptual image hashes.** Meta's PDQ is a DCT-based 256-bit hash with a quality score;
  it is not flip-invariant by itself, but the reference implementation emits the eight
  rotation and flip variants so a matcher can catch mirrored copies.
  [PDQ README](https://github.com/facebook/ThreatExchange/blob/main/pdq/README.md),
  [Meta announcement, 2019](https://about.fb.com/news/2019/08/open-source-photo-video-matching/).
- **Video hashes.** TMK+PDQF averages per-frame features over time and matches whole,
  near-identical videos well (resolution changes, grey bars, sepia); it is documented as
  weak on trimmed clips. vPDQ hashes sampled frames (about 1 fps) and compares them as
  sets in both directions, so it finds a clip inside a longer video.
  [TMK](https://github.com/facebook/ThreatExchange/tree/main/tmk),
  [vPDQ](https://github.com/facebook/ThreatExchange/tree/main/vpdq).
- **Learned copy detection.** Meta trains descriptors on synthetic edits (its AugLy library
  applies more than 100 of them). In Meta's 2023 Video Similarity Challenge the queries
  were edited with crops, flips, rotations, colour changes, blur, noise, overlays, and
  speed changes; the top systems used frame-level learned features, and speed changes
  were among the easiest edits to catch.
  [DISC21](https://arxiv.org/abs/2201.06494),
  [SSCD, CVPR 2022](https://openaccess.thecvf.com/content/CVPR2022/html/Pizzi_A_Self-Supervised_Descriptor_for_Image_Copy_Detection_CVPR_2022_paper.html),
  [VSC 2023](https://arxiv.org/abs/2306.09489).
- **Audio fingerprints.** Shazam matches constellations of spectrogram peaks
  ([Wang, ISMIR 2003](https://www.princeton.edu/~cuff/ele201/files/Wang03-shazam.pdf)).
  The Philips method (Haitsma and Kalker) builds 32-bit sub-fingerprints from band-energy
  differences ([ISMIR 2002](https://archives.ismir.net/ismir2002/paper/000014.pdf)); its
  authors note it is not robust to linear speed changes beyond about 2%. Chromaprint
  (AcoustID) uses chroma features and learned filters to identify the same recording
  across encodings ([how Chromaprint works](https://oxygene.sk/2011/01/how-does-chromaprint-work/)).

**Documented versus folklore.** Older academic hashes have published weak spots (TMK on
trims, the Philips audio hash on speed). That is documented. That those weak spots carry
over to current platform matchers is not: none of those systems is public, Meta trained its
own on the same edits, and the policies above judge originality by what was added, at the
account or channel level, over time. A cosmetic edit that slipped past a matcher would
still be "minimal edits" under every policy here.

## Substantive versus cosmetic changes

Moves: which fingerprint channel the change alters (visual, audio, script). The last
column is what `ralphy unit originality` is designed to report for the change applied
alone to an existing piece.

| Change | Class | Moves | Policy reading | Expected verdict alone |
|---|---|---|---|---|
| New hook (rewritten opening line and first shot) | substantive, partial | script, audio, visual (opening only) | New contribution, but the rest is the same piece | likely-duplicate or similar |
| Re-edit / reorder of beats | substantive | visual sequence, script order, audio order | Counts as real editing when it tells the story differently | similar |
| VO re-record (new read, voice, or delivery) | substantive | audio | Voiceover is named as meaningful; pictures still match | likely-duplicate (same footage) |
| New B-roll (different footage or generations) | substantive | visual | New pictures under the same story | similar (script) or original |
| New layout (split, picture-in-picture, text-led) | substantive | visual | New visual composition | similar or original |
| New format (talking head to listicle, video to carousel) | substantive | visual, script, audio | A different piece | original |
| New pacing (cut rhythm, scene lengths, duration) | substantive, partial | visual timing, audio timing | Real edit when combined with others | similar |
| New body script, CTA, or persona | substantive | script, audio (persona: visual) | New contribution | similar or original |
| Mirror (horizontal flip) | cosmetic | none in substance | Trivial change | likely-duplicate |
| Speed change (1.1x to 1.2x) | cosmetic | timing only | Named as not original by Instagram and YouTube | likely-duplicate |
| LUT / colour grade / brightness | cosmetic | colour only | Trivial change | likely-duplicate |
| Crop, zoom, reframe of the same shot | cosmetic | framing only | Trivial change | likely-duplicate |
| Trim a second off either end | cosmetic | duration only | Trivial change | likely-duplicate |
| Noise, grain, blur, borders, watermark | cosmetic | texture only | Borders and watermarks named as not enough | likely-duplicate |
| Pitch shift, re-encode, resolution change | cosmetic | none in substance | Pitch or speed altered songs named by YouTube | likely-duplicate |

Two rules follow. A change that leaves the footage alone (a new hook line, a new VO, a new
CTA) is not enough on its own, because the pictures still match. And a cosmetic layer
added on top of a substantive change adds nothing to uniqueness; it is recorded, never
counted.

## Ralphy's check: `ralphy unit originality`

```bash
ralphy unit originality <unit|file> [--against <unit|project|path>]... [--limit 50] [--script <file>]
```

The subject is a Unit (its selected, else latest, revision) or a media / script file.
Without `--against` it is compared with the Workspace's other Units (newest first, up to
`--limit`), the Unit's linked source revision (`ralphy unit source`), and media in its
Project's `artifacts/refs/`. With `--against`, only the named Units, Projects (all their
Units), files, or directories of media. A file subject with only path targets needs no
Workspace. Everything is local: ffmpeg decodes, hashing is TypeScript, no provider call.

### Axes

Every score reads "how much of the subject already exists in the other", in [0, 1].

- **Visual.** Frames sampled at up to 2 fps (at most 240), scaled to 32x32 luma, hashed
  with pHash (DCT, 64 bits) and dHash (gradient, 64 bits) into one 128-bit signature, plus
  the signature of the mirrored frame. Near-uniform frames are skipped. Each subject frame
  earns credit for its best match (linear ramp from 0.70 to 0.85 signature similarity).
  `footage` is the mean credit regardless of order; `sequence` is the best monotonic,
  many-to-one alignment (so speed changes and trims still align). The axis score is
  `sequence + 0.5 x (footage - sequence)`: footage reused in a new order counts half.
  Both orientations are tried; `mirrored: true` means the flipped one matched.
- **Audio.** Mono 8 kHz, first 180 s. A band-energy-difference fingerprint in the Philips
  style: 2048-sample Hann frames, 32 ms hop, 33 log bands from 300 to 2000 Hz, one 32-bit
  sub-fingerprint per frame. Bits whose energy difference is under -50 dB of the loudest
  band are masked out on both sides, so silent bands on tonal audio do not "agree".
  Every 2 s block of the subject is slid across the other track; its best bit error rate
  (BER) earns credit on a ramp (BER 0.20 or less earns 1, 0.35 or more earns 0). Same
  footage / sequence / score shape as visual. Like the published method it is not robust
  to tempo changes; the visual axis carries those.
- **Script.** Word 3-gram containment of the subject's text in the other's, plus the
  Jaccard overlap and a separate `hook` overlap of the openings. Text comes from `--script`,
  a sidecar next to the media (`.srt`, `.vtt`, `.transcript.json`, `.captions.json`,
  `.txt`, `.md`), or a Unit's script / caption / body Document items and caption Artifacts.
  Prompt fields in JSON are never read as script.

### Thresholds and verdicts

| Threshold | Value | Why |
|---|---|---|
| Frame credit ramp | 0.70 to 0.85 similarity | Unrelated frames sit near 0.5 (max 0.68 on the synthetic set); re-encoded copies sit above 0.9 |
| Audio BER ramp | 0.20 to 0.35 | The Philips paper's match threshold is 0.35; random audio sits near 0.5 |
| Reorder weight | 0.5 | Footage reused in a new order is reuse, but less than the same cut |
| Visual duplicate / similar | 0.85 / 0.50 | |
| Audio duplicate / similar | 0.85 / 0.50 | |
| Script duplicate / similar | 0.90 / 0.60 | Script decides a duplicate only for text-only pieces |

- `likely-duplicate`: visual score at or above 0.85; or the same soundtrack (audio at or
  above 0.85) over substantially reused footage (visual footage at or above 0.5); or,
  when neither side has pictures, audio at or above 0.85 or script at or above 0.90.
- `similar`: any axis at or above its similar threshold, or visual footage at or above
  0.5 (the same shots re-cut).
- `original`: otherwise.

Script alone never makes a video a duplicate: a re-shot video of the same script is a new
video, and it reads `similar`. Audio alone never does either: a licensed trending sound
under new pictures is normal, and it reads `similar` with a note. The report's overall
verdict is the worst comparison, and `nearest` names it.

### Calibration on the synthetic set

Base: four distinct 2 s generator segments over a stepped-tone track. Scores against the
base (deterministic sources, x264 ultrafast):

| Variant | Visual | Footage / sequence | Audio | Verdict |
|---|---|---|---|---|
| Mirrored | 1.00 (mirrored) | 1.00 / 1.00 | 1.00 | likely-duplicate |
| Sped up 1.2x (video and audio) | 1.00 | 1.00 / 1.00 | 0.02 | likely-duplicate |
| Re-graded (contrast, saturation, gamma, colour balance) | 1.00 | 1.00 / 1.00 | 1.00 | likely-duplicate |
| Cropped 10% and trimmed 0.7 s | 0.92 | 0.92 / 0.92 | 1.00 | likely-duplicate |
| Re-edit: same shots reordered, new track | 0.75 | 1.00 / 0.50 | 0.00 | similar |
| Unrelated generators and track | 0.00 | 0.00 / 0.00 | 0.00 | original |

Stills: a mirrored, brightened copy scores 1.00 (likely-duplicate); an unrelated image 0.00.

### Limits

- Synthetic calibration only. Real footage with similar framing (two talking heads in the
  same room, the same product on the same table) can push unrelated frames toward the
  0.70 ramp start. Treat `similar` on such pairs as a prompt to look, not a fact.
- 32x32 luma ignores aspect ratio and colour: a 9:16 and a 16:9 cut of the same shot read
  as different; a pure hue change reads as the same.
- No learned descriptor and no flip or rotation beyond the horizontal mirror; production
  matchers are stronger, so a pass here is necessary, not sufficient.
- Chromaprint (`fpcalc`) is not used even when installed; the built-in fingerprint keeps
  results identical across machines.
- Fingerprints are not cached; a Workspace with many Units costs one ffmpeg decode per
  Unit per run.

## Variants: planner and tournament gate

- `ralphy batch plan-variants <batch> --count N [--axes ...] [--cosmetic ...]` plans N
  variants with pairwise-distinct sets of substantive axes. Every set must change the
  pictures through a strong axis (re-edit, B-roll, layout, format, persona) and move at
  least one more channel. A cosmetic label offered as an axis is refused; `--cosmetic`
  adds an optional last layer that is recorded and never counted. Writes
  `variant-matrix.json`.
- `ralphy batch tournament <batch>` ranks the variants, then runs the gate best first: a
  variant whose declared changes are cosmetic only, or that reads `likely-duplicate`
  against a higher-ranked emitted sibling (compared both ways), is refused. Refused
  variants stay in the ranking and on disk; they are not emitted. `--allow-duplicate
  <variantId>=<reason>` emits one anyway and logs the reason to that variant's
  `logs/user-prompts.jsonl` as `stage: "duplicate-override"` (for example a music-bed A/B
  test where only the winner ships).
- Each variant's `changedAxes` and `cosmeticLayer` ride on its tournament entry and are
  written to its Unit's decision ledger (`changed_axes`, `cosmetic_layer`, #558) when the
  Unit exists; `ralphy unit decisions <unit> --derive` also reads them from the variant's
  `scenario.json` (`variant_changed_axes`, `variant_cosmetic_layer`). `batch vary` now
  records its single axis there too.
