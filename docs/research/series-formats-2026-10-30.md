# Series formats that beat their channel (2026-10-30)

Owner definition: a format is how a video is made and presented (big on-screen text over a person doing something, a podcast clip, a person telling something in a fixed structure, several characters acted out), and the strongest signal is a numbered series of that format on one channel that collects more views than the channel's other videos.

> **Correction (2026-10-30, owner review):** references must be posted within the last 90 days (older hits come from a different algorithm era). YouTube flat listings carry no post date, so this pass mixed old and fresh series. Post date of the digested part, from its yt-dlp metadata: lifeactuator 2026-10-23 (7 days) and HybridCalisthenics 2026-10-15 (15 days) are fresh; brandonclearminds 2026-07-16 (106 days), JeffSu 2026-03-26, MarketPowerYT 2025-05-18, HotshotTek 2024-10-10, naomikong 2024-08-29 and StrategicWealthDesign 2022-11-16 are stale and are not references. The format observations below still describe how those series were built, but only the two fresh series are candidates to adapt. #588 and #590 make freshness a hard filter.

Method: in the scratch corpus (kept creators, main group, all five niches), captions with a part / episode / day / number marker were grouped into series per channel (at least 3 parts and 5 other videos); the series median views were compared with the same channel's other videos. YouTube views are rounded but usable for this within-channel comparison. 212 channels run at least one series; 47 series reach 1.5x their channel's other videos and 25 reach 2x. One video from each of the top 8 series was digested (`ralphy ref digest`, 1 frame per second) and the format was read from the frames.

| Channel (niche) | Series | Parts | Median views, series vs other | Lift | Digested part posted | Format read from frames |
|---|---|---|---|---|---|---|
| MarketPowerYT (investing) | economics of a fictional universe | 4 | 1.55M vs 25k | 62x | 2025-05-18 (stale) | Movie clip with a caption question as the hook, then flat illustrated explainer cards on a solid background, then the presenter on camera; captions throughout |
| naomikong (fitness) | beginner's guide to gym equipment | 3 | 144k vs 7.4k | 19x | 2024-08-29 (stale) | Big title plus "PT 1" over a full-body shot, then close-up B-roll of the machine with voice-over subtitles; the person is rarely talking to camera |
| StrategicWealthDesign (finance) | financial advisor reacts to movies | 3 | 17k vs 1.9k | 9x | 2022-11-16 (stale) | Split screen: the movie scene on top, the expert talking below; series title and part number pinned; word-group captions |
| HybridCalisthenics (fitness) | trying odd public equipment | 3 | 490k vs 65k | 7.5x | 2026-10-15 (fresh) | On location, the creator tries the thing while explaining; bold one-line captions; viewer comments pasted on screen as proof |
| HotshotTek (AI tools / tech) | device A vs device B test | 6 | 39k vs 8k | 4.8x | 2024-10-10 (stale) | Static top-down product test with an on-screen timer; the question stays as big text; time-lapse to the result, no face |
| lifeactuator (psychology) | things people with ADHD do | 22 | 88k vs 19k | 4.6x | 2026-10-23 (fresh) | Big title text plus "Part N" over the creator silently acting out everyday behaviour; almost no speech, short reaction captions |
| brandonclearminds (psychology) | episode N of a character's inner monologue | 4 | 13.5k vs 3.3k | 4.1x | 2026-07-16 (stale, 106 days) | Talking head in character (one person playing a type), "Episode N" plus a situation line as the title, word-by-word captions |
| JeffSu (AI tools) | one rule per episode for an AI tool | 4 | 66.5k vs 24k | 2.8x | 2026-03-26 (stale) | Talking-head hook for 3 seconds, then animated UI motion graphics with single-line captions |

What repeats across niches:

- The series title and part number sit on screen as big text in the first frame; the part number is part of the packaging.
- Each format has one fixed visual template per series (the same layout, title position and caption style every episode), so episodes are cheap to produce.
- Three shapes dominate: a person doing something with a big text frame and little speech (lifeactuator, naomikong, HybridCalisthenics), an expert reacting to or explaining through pop culture (MarketPowerYT, StrategicWealthDesign), and a fixed test or rule template (HotshotTek, JeffSu). The in-character monologue (brandonclearminds) is the skit-like shape.

Caveats: within-channel medians, one digested video per series, captions used to find series (a series without a part marker is missed), five niches of the scratch corpus.
