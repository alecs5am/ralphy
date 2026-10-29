# Niche report: psychology (EN)

Issue #576. First real run of `ralphy trends niche init` / `niche report` on the owner's target niche, English creators only, free logged-out sources (no cookies, proxies, paid runs, or provider keys), scratch corpus `.ralphy/cache/trend-corpus-run/` (gitignored). Seeds were authored by the agent (`--seeds-file`): 40 YouTube keyword queries, 16 hashtags, 13 YouTube and 7 TikTok creator handles, 8 sub-niches, a 230-term English lexicon. Method: `docs/research/trend-corpus.md`, "Niche onboarding (#576)".

## Read this first

- **What the ranking covers.** Multipliers need post times. TikTok listings carry them; YouTube channel Shorts tabs do not without the YouTube Data API key, so the 370 kept YouTube channels count for coverage, sub-niche supply, and size bands, but every score-based section (what to copy, outliers, formats, hooks, gaps' demand side) is **TikTok only: 47 kept creators**. English TikTok creators can only be found through cross-platform handles (Explore is localized to the client IP's country, KR), which caps this side.
- **Labels.** Content-format and hook labels are rule pre-labels from titles (the LLM label pass was off; no paid calls), so format rows are mostly "insufficient data" and replication rarely fires.
- **Negative control group** is 2 creators, provisional: only TikTok creators can qualify (dated videos), and follower growth needs 60 days of daily snapshots.
- **Relevance gate precision**, hand-checked: rule-only gate 47 / 50 kept and 12 / 20 dropped correct (94% / 60%); with the profile-anchored keep (a bio stating a mental-health profession keeps a creator from 40% on-topic) 49 / 50 and 18 / 20 (98% / 90%). Targets were 90% / 80%.

## Headline findings

Top five copyable references (copyability = size weight x (ln multiplier + reach term) x replication; every component is in the table below):

1. **tiktok:@carolinemiddelsdorf** (micro, 83k followers, trauma and healing): 373x the creator's own baseline at 373k views, 4.5 views per follower. A small account with no audience to carry it, so the video itself traveled; score 5.76, the highest. The video was 3.7 days old at the snapshot, past the provisional window but still growing.
2. **tiktok:@anxietyjosh** (micro, 14k followers, anxiety): 66x at 908k views, 66 views per follower, the strongest reach beyond the audience in the niche.
3. **tiktok:@childocdtherapist** (micro, 52k followers, anxiety / OCD, therapist-led): two separate breakouts two days apart, 77x at 1.9M and 44x at 1.1M views (36 and 21 views per follower); the first carries the `podcast-clip` format label. Repeat breakouts on one small account point at a format, not luck.
4. **tiktok:@doctorramani** (mid, 325k followers, relationships and attachment): 133x at 2.5M views, 7.7 views per follower; the mid-size discount (0.6) keeps it below the micro accounts despite the larger absolute numbers.
5. **tiktok:@drdavidclarke** (mid, dark psychology): 59x at 175k views but only 0.43 views per follower, so most of the score is the creator-relative jump, not algorithmic reach; a weaker reference than the four above.

Other signals, with their limits:

- **Sub-niche gaps.** Therapist-led education (gap 1.75), self-help and habits (1.36), and anxiety (1.27) show more hits than their creator share; relationships and attachment (0.35) and dark psychology (0.63) are the most crowded. Demand is measured on TikTok videos only; supply counts creators on both platforms.
- **Cadence.** TikTok creators with a strong-or-better video in the last 30 days post a median 5.4 times a week at a median 61 s, against 76 s for the rest (14 vs 24 creators; a breakout proxy, not follower growth).
- **Hooks.** Question hooks are the only hook type with enough data (n 108, hit rate 13.9% vs 12.7% for the niche, "in line"); among small creators they replicated across 3 accounts.
- **Size coverage.** Quotas filled for <10k, 10k-100k, and 100k-1M (126 / 129 / 129 kept); 1M+ is short (32 of 75), which is the band where copyability matters least.


Generated 2026-10-28T11:13:57.640Z by `ralphy trends niche report psychology --lang en`. Seeds: file. Multipliers, labels, and copyability scores are Ralphy's own estimates from creator-relative baselines, not platform data.

## Coverage

| Status | Creators |
| --- | --- |
| kept | 417 |
| dropped | 1,012 |
| undetermined | 203 |
| candidate | 0 |
| outOfSample | 145 |

Groups among kept creators: main 398, negative control 2, anomaly 17.

| Platform | lt10k | 10k-100k | 100k-1m | 1m-plus | unknown |
| --- | --- | --- | --- | --- | --- |
| youtube | 106 | 119 | 119 | 25 | 1 |
| tiktok | 20 | 10 | 10 | 7 | 0 |

| Quota band | Quota | Kept | Deficit |
| --- | --- | --- | --- |
| lt10k | 75 | 126 | 0 |
| 10k-100k | 75 | 129 | 0 |
| 100k-1m | 75 | 129 | 0 |
| 1m-plus | 75 | 32 | 43 |

Videos: 20,892 listed (TikTok 2,653, YouTube 18,239), 2,737 dated, 2,734 scored. Analysis window: the last 90 days, 953 dated main-group videos, 707 of them mature (7 d+) with a non-thin baseline.

| Discovery run | Languages | Wall (min) | Rounds | Stop reason | Blocks |
| --- | --- | --- | --- | --- | --- |
| 2026-10-28T09:49:56.860Z | en | 29.6 | 2 | target-reached | 0 |
| 2026-10-28T10:51:15.989Z | en | 7.3 | 1 | target-reached | 1 |

| Gate outcome | Creators |
| --- | --- |
| dropped:off-topic | 1,012 |
| undetermined:too-few-captions | 203 |

## What to copy (copyability ranking)

Score = sizeWeight x (ln multiplier + 0.5 ln(1 + min(views/followers, 100))) x (replicationFactor + same-creator repeats). Noise floor 50,000 views. 64 videos from 10 creators ranked (platforms: tiktok); at most 2 rows per creator below. Excluded: unscored 17557, thin-baseline 112, provisional 61, noise-floor 714, not-above-baseline 2.

| # | Score | Creator | Size | Sub-niche | X | Views | Views/follower | Size weight | Replication (small creators with a hit) | Factor | Format | Hook | Video |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 5.76 | tiktok:@carolinemiddelsdorf | micro | trauma-healing | 373.18x | 373,100 | 4.52 | 0.85 | format unlabeled (0); hook unlabeled (0) | 1 | - | - | https://www.tiktok.com/@carolinemiddelsdorf/video/7700302626205846817 |
| 2 | 5.351 | tiktok:@anxietyjosh | micro | anxiety | 66.15x | 907,700 | 66.13 | 0.85 | format unlabeled (0); hook unlabeled (0) | 1 | - | - | https://www.tiktok.com/@anxietyjosh/video/7682822331542064406 |
| 3 | 5.227 | tiktok:@childocdtherapist | micro | anxiety | 76.66x | 1,900,000 | 36.38 | 0.85 | format podcast-clip (1); hook unlabeled (0) | 1 | podcast-clip | - | https://www.tiktok.com/@childocdtherapist/video/7692503595198975262 |
| 4 | 4.539 | tiktok:@childocdtherapist | micro | anxiety | 44.38x | 1,100,000 | 21.06 | 0.85 | format unlabeled (0); hook unlabeled (0) | 1 | - | - | https://www.tiktok.com/@childocdtherapist/video/7691786588522597663 |
| 5 | 3.585 | tiktok:@doctorramani | mid | relationships-attachment | 133.47x | 2,500,000 | 7.7 | 0.6 | format unlabeled (0); hook unlabeled (0) | 1 | - | - | https://www.tiktok.com/@doctorramani/video/7691392428221173006 |
| 6 | 2.548 | tiktok:@drdavidclarke | mid | dark-psychology-persuasion | 58.56x | 175,300 | 0.43 | 0.6 | format unlabeled (0); hook unlabeled (0) | 1 | - | - | https://www.tiktok.com/@drdavidclarke/video/7697006742764277023 |
| 7 | 2.343 | tiktok:@drdavidclarke | mid | dark-psychology-persuasion | 43.24x | 131,700 | 0.32 | 0.6 | format unlabeled (0); hook question (1) | 1 | - | question | https://www.tiktok.com/@drdavidclarke/video/7685934148023864606 |
| 8 | 2.305 | tiktok:@doctorramani | mid | relationships-attachment | 31.69x | 377,400 | 1.16 | 0.6 | format unlabeled (0); hook unlabeled (0) | 1 | - | - | https://www.tiktok.com/@doctorramani/video/7699231217799023886 |
| 9 | 1.435 | tiktok:@anxiety_fitness | mega | anxiety | 40.24x | 859,200 | 0.8 | 0.3 | format unlabeled (0); hook question (1); +2 same creator | 1.2 | - | question | https://www.tiktok.com/@anxiety_fitness/video/7696187023920614678 |
| 10 | 1.144 | tiktok:@anxiety_fitness | mega | anxiety | 20.17x | 447,900 | 0.41 | 0.3 | format unlabeled (0); hook question (1); +2 same creator | 1.2 | - | question | https://www.tiktok.com/@anxiety_fitness/video/7680580969019018518 |
| 11 | 1.057 | tiktok:@thepsychdoctormd | mega | adhd-neurodivergence | 13.63x | 268,500 | 0.21 | 0.3 | format unlabeled (0); hook question (1); +3 same creator | 1.3 | - | question | https://www.tiktok.com/@thepsychdoctormd/video/7687659437678480654 |
| 12 | 0.997 | tiktok:@thepsychdoctormd | mega | adhd-neurodivergence | 23.43x | 501,600 | 0.4 | 0.3 | format unlabeled (0); hook unlabeled (0) | 1 | - | - | https://www.tiktok.com/@thepsychdoctormd/video/7675865935277853965 |
| 13 | 0.905 | tiktok:@mentalhealness | mega | dark-psychology-persuasion | 18.91x | 322,100 | 0.16 | 0.3 | format unlabeled (0); hook unlabeled (0) | 1 | - | - | https://www.tiktok.com/@mentalhealness/video/7695881083723730206 |
| 14 | 0.843 | tiktok:@theworkoutwitch | mega | anxiety | 15.39x | 377,200 | 0.16 | 0.3 | format unlabeled (0); hook unlabeled (0) | 1 | - | - | https://www.tiktok.com/@theworkoutwitch/video/7694072049882451214 |
| 15 | 0.8 | tiktok:@theworkoutwitch | mega | anxiety | 13.37x | 359,800 | 0.15 | 0.3 | format unlabeled (0); hook unlabeled (0) | 1 | - | - | https://www.tiktok.com/@theworkoutwitch/video/7688922156037721357 |
| 16 | 0.609 | tiktok:@mentalhealness | mega | dark-psychology-persuasion | 7.43x | 105,400 | 0.05 | 0.3 | format unlabeled (0); hook unlabeled (0) | 1 | - | - | https://www.tiktok.com/@mentalhealness/video/7698545005396282655 |
| 17 | 0.266 | tiktok:@drjulie | mega | anxiety | 2.37x | 250,000 | 0.05 | 0.3 | format unlabeled (0); hook question (1) | 1 | - | question | https://www.tiktok.com/@drjulie/video/7673525465885314306 |
| 18 | 0.183 | tiktok:@drjulie | mega | anxiety | 1.8x | 204,600 | 0.04 | 0.3 | format unlabeled (0); hook unlabeled (0) | 1 | - | - | https://www.tiktok.com/@drjulie/video/7676880242593729794 |

## Top outliers

Label thresholds (percentile, tiktok/psychology): breakout 27.22x, outlier 11.33x with z >= 2, strong 3x.

### Overall

| Creator | Size | Sub-niche | X | Label | Views | Age (d) | Video |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tiktok:@doctorramani | mid | relationships-attachment | 133.47x | breakout | 2,500,000 | 27.7 | https://www.tiktok.com/@doctorramani/video/7691392428221173006 |
| tiktok:@childocdtherapist | micro | anxiety | 76.66x | breakout | 1,900,000 | 24.7 | https://www.tiktok.com/@childocdtherapist/video/7692503595198975262 |
| tiktok:@drmscoggins | nano | self-help-habits | 76.43x | breakout | 33,600 | 11.3 | https://www.tiktok.com/@drmscoggins/video/7697488374948564255 |
| tiktok:@anxietyjosh | micro | anxiety | 66.15x | breakout | 907,700 | 50.8 | https://www.tiktok.com/@anxietyjosh/video/7682822331542064406 |
| tiktok:@drdavidclarke | mid | dark-psychology-persuasion | 58.56x | breakout | 175,300 | 12.6 | https://www.tiktok.com/@drdavidclarke/video/7697006742764277023 |
| tiktok:@dr.vanessaphd | mid | therapist-led | 50.07x | breakout | 34,200 | 29.9 | https://www.tiktok.com/@dr.vanessaphd/video/7690589721331911967 |
| tiktok:@childocdtherapist | micro | anxiety | 44.38x | breakout | 1,100,000 | 26.6 | https://www.tiktok.com/@childocdtherapist/video/7691786588522597663 |
| tiktok:@drdavidclarke | mid | dark-psychology-persuasion | 43.24x | breakout | 131,700 | 42.4 | https://www.tiktok.com/@drdavidclarke/video/7685934148023864606 |
| tiktok:@anxiety_fitness | mega | anxiety | 40.24x | breakout | 859,200 | 14 | https://www.tiktok.com/@anxiety_fitness/video/7696187023920614678 |
| tiktok:@adhddude | micro | adhd-neurodivergence | 24.06x | outlier | 36,500 | 43.8 | https://www.tiktok.com/@adhddude/video/7685422914551827726 |

### By sub-niche

**adhd-neurodivergence**

| Creator | Size | Sub-niche | X | Label | Views | Age (d) | Video |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tiktok:@adhddude | micro | adhd-neurodivergence | 24.06x | outlier | 36,500 | 43.8 | https://www.tiktok.com/@adhddude/video/7685422914551827726 |
| tiktok:@thepsychdoctormd | mega | adhd-neurodivergence | 23.43x | outlier | 501,600 | 69.6 | https://www.tiktok.com/@thepsychdoctormd/video/7675865935277853965 |
| tiktok:@thepsychdoctormd | mega | adhd-neurodivergence | 22.67x | outlier | 451,500 | 67.9 | https://www.tiktok.com/@thepsychdoctormd/video/7676482669215026445 |

**anxiety**

| Creator | Size | Sub-niche | X | Label | Views | Age (d) | Video |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tiktok:@childocdtherapist | micro | anxiety | 76.66x | breakout | 1,900,000 | 24.7 | https://www.tiktok.com/@childocdtherapist/video/7692503595198975262 |
| tiktok:@anxietyjosh | micro | anxiety | 66.15x | breakout | 907,700 | 50.8 | https://www.tiktok.com/@anxietyjosh/video/7682822331542064406 |
| tiktok:@childocdtherapist | micro | anxiety | 44.38x | breakout | 1,100,000 | 26.6 | https://www.tiktok.com/@childocdtherapist/video/7691786588522597663 |

**dark-psychology-persuasion**

| Creator | Size | Sub-niche | X | Label | Views | Age (d) | Video |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tiktok:@drdavidclarke | mid | dark-psychology-persuasion | 58.56x | breakout | 175,300 | 12.6 | https://www.tiktok.com/@drdavidclarke/video/7697006742764277023 |
| tiktok:@drdavidclarke | mid | dark-psychology-persuasion | 43.24x | breakout | 131,700 | 42.4 | https://www.tiktok.com/@drdavidclarke/video/7685934148023864606 |
| tiktok:@mentalhealness | mega | dark-psychology-persuasion | 18.91x | outlier | 322,100 | 15.4 | https://www.tiktok.com/@mentalhealness/video/7695881083723730206 |

**general**

Insufficient data.

**pop-psychology-facts**

Insufficient data.

**relationships-attachment**

| Creator | Size | Sub-niche | X | Label | Views | Age (d) | Video |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tiktok:@doctorramani | mid | relationships-attachment | 133.47x | breakout | 2,500,000 | 27.7 | https://www.tiktok.com/@doctorramani/video/7691392428221173006 |
| tiktok:@doctorramani | mid | relationships-attachment | 20.95x | outlier | 309,900 | 85.8 | https://www.tiktok.com/@doctorramani/video/7669823861667532046 |

**self-help-habits**

| Creator | Size | Sub-niche | X | Label | Views | Age (d) | Video |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tiktok:@drmscoggins | nano | self-help-habits | 76.43x | breakout | 33,600 | 11.3 | https://www.tiktok.com/@drmscoggins/video/7697488374948564255 |

**therapist-led**

| Creator | Size | Sub-niche | X | Label | Views | Age (d) | Video |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tiktok:@dr.vanessaphd | mid | therapist-led | 50.07x | breakout | 34,200 | 29.9 | https://www.tiktok.com/@dr.vanessaphd/video/7690589721331911967 |
| tiktok:@dr.vanessaphd | mid | therapist-led | 14.17x | outlier | 12,800 | 33.9 | https://www.tiktok.com/@dr.vanessaphd/video/7689079645010021663 |

**trauma-healing**

| Creator | Size | Sub-niche | X | Label | Views | Age (d) | Video |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tiktok:@carolinemiddelsdorf | micro | trauma-healing | 15.06x | outlier | 14,600 | 24.7 | https://www.tiktok.com/@carolinemiddelsdorf/video/7692517285365386529 |
| tiktok:@lisasonni | macro | trauma-healing | 13.62x | outlier | 17,200 | 11.8 | https://www.tiktok.com/@lisasonni/video/7697309327320780038 |
| tiktok:@carolinemiddelsdorf | micro | trauma-healing | 12.66x | outlier | 15,400 | 15.9 | https://www.tiktok.com/@carolinemiddelsdorf/video/7695787222041103649 |

### By size band

**seed**

Insufficient data.

**nano**

| Creator | Size | Sub-niche | X | Label | Views | Age (d) | Video |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tiktok:@drmscoggins | nano | self-help-habits | 76.43x | breakout | 33,600 | 11.3 | https://www.tiktok.com/@drmscoggins/video/7697488374948564255 |

**micro**

| Creator | Size | Sub-niche | X | Label | Views | Age (d) | Video |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tiktok:@childocdtherapist | micro | anxiety | 76.66x | breakout | 1,900,000 | 24.7 | https://www.tiktok.com/@childocdtherapist/video/7692503595198975262 |
| tiktok:@anxietyjosh | micro | anxiety | 66.15x | breakout | 907,700 | 50.8 | https://www.tiktok.com/@anxietyjosh/video/7682822331542064406 |
| tiktok:@childocdtherapist | micro | anxiety | 44.38x | breakout | 1,100,000 | 26.6 | https://www.tiktok.com/@childocdtherapist/video/7691786588522597663 |

**mid**

| Creator | Size | Sub-niche | X | Label | Views | Age (d) | Video |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tiktok:@doctorramani | mid | relationships-attachment | 133.47x | breakout | 2,500,000 | 27.7 | https://www.tiktok.com/@doctorramani/video/7691392428221173006 |
| tiktok:@drdavidclarke | mid | dark-psychology-persuasion | 58.56x | breakout | 175,300 | 12.6 | https://www.tiktok.com/@drdavidclarke/video/7697006742764277023 |
| tiktok:@dr.vanessaphd | mid | therapist-led | 50.07x | breakout | 34,200 | 29.9 | https://www.tiktok.com/@dr.vanessaphd/video/7690589721331911967 |

**macro**

| Creator | Size | Sub-niche | X | Label | Views | Age (d) | Video |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tiktok:@lisasonni | macro | trauma-healing | 13.62x | outlier | 17,200 | 11.8 | https://www.tiktok.com/@lisasonni/video/7697309327320780038 |

**mega**

| Creator | Size | Sub-niche | X | Label | Views | Age (d) | Video |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tiktok:@anxiety_fitness | mega | anxiety | 40.24x | breakout | 859,200 | 14 | https://www.tiktok.com/@anxiety_fitness/video/7696187023920614678 |
| tiktok:@thepsychdoctormd | mega | adhd-neurodivergence | 23.43x | outlier | 501,600 | 69.6 | https://www.tiktok.com/@thepsychdoctormd/video/7675865935277853965 |
| tiktok:@thepsychdoctormd | mega | adhd-neurodivergence | 22.67x | outlier | 451,500 | 67.9 | https://www.tiktok.com/@thepsychdoctormd/video/7676482669215026445 |

## Winning formats and hook types

hit = calibrated label strong, outlier, or breakout; lift = label hit rate / niche hit rate - 1; mature (7 d+), non-thin, main-group videos. Niche hit rate 0.127 over 707 videos; labeled: format 14, hook 147.

### Formats

| Format | n | Creators | Median X | Hit rate | Lift | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| podcast-clip | 8 | 6 | - | - | - | insufficient data |
| listicle | 4 | 4 | - | - | - | insufficient data |
| pov | 2 | 2 | - | - | - | insufficient data |

### Hook types

| Hook | n | Creators | Median X | Hit rate | Lift | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| question | 108 | 21 | 0.98 | 0.139 | 0.091 | in line |
| when-trigger | 25 | 8 | 0.94 | 0.12 | -0.057 | in line |
| here-is-why | 8 | 6 | - | - | - | insufficient data |
| numbered-list | 5 | 4 | - | - | - | insufficient data |
| pov | 1 | 1 | - | - | - | insufficient data |

## Cadence and length of creators who grow

proxy: creators with a strong-or-better video in the last 30 days (follower history spans 0 days; growth needs 14+).

| Group | Creators | Median posts / week | Median length (s) | Verdict |
| --- | --- | --- | --- | --- |
| breaking out (strong+ video in 30 d) | 14 | 5.4 | 61 | ok |
| others | 24 | 0 | 76 | ok |

## Sub-niche saturation vs demand

gap = (sub-niche hit rate / niche hit rate) / (creator share x number of sub-niches); above 1 means more demand than supply.

| Sub-niche | Creators | Share | Videos | Median X | Hit rate | Median views/follower | Gap | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Therapist-led education | 18 | 0.045 | 44 | 0.73 | 0.091 | 0.005 | 1.75 | under-supplied |
| Self-help and habits | 25 | 0.063 | 51 | 1.02 | 0.098 | 0.193 | 1.36 | under-supplied |
| Anxiety | 50 | 0.126 | 159 | 0.89 | 0.182 | 0.304 | 1.27 | under-supplied |
| Trauma and healing | 42 | 0.106 | 88 | 0.94 | 0.148 | 0.009 | 1.22 | balanced |
| ADHD and neurodivergence | 64 | 0.161 | 95 | 0.89 | 0.158 | 0.019 | 0.86 | balanced |
| Dark psychology and persuasion | 64 | 0.161 | 120 | 0.92 | 0.117 | 0.02 | 0.63 | saturated |
| general (no dominant sub-niche) | 50 | 0.126 | 46 | 1.03 | 0.065 | 0.82 | 0.45 | saturated |
| Relationships and attachment | 63 | 0.158 | 95 | 0.57 | 0.063 | 0.043 | 0.35 | saturated |
| Pop-psychology facts | 22 | 0.055 | 9 | - | - | - | - | insufficient data |

## Entry formats for a new account

seed / nano / micro creators only; replicated = a strong-or-better video for 2+ distinct small creators. Small-creator videos 388, hit rate 0.119.

| Axis | Label | n | Small creators with a hit | Replicated | Hit rate | Lift | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| hook | question | 49 | 3 | yes | 0.122 | 0.033 | in line |
| format | podcast-clip | 7 | 1 | no | - | - | insufficient data |
| hook | when-trigger | 9 | 1 | no | - | - | insufficient data |
| format | listicle | 1 | 0 | no | - | - | insufficient data |
| format | pov | 1 | 0 | no | - | - | insufficient data |
| hook | here-is-why | 2 | 0 | no | - | - | insufficient data |
| hook | numbered-list | 1 | 0 | no | - | - | insufficient data |

## Negative control group

Rule: active, 6+ posts in 30 days, 75%+ of the 60-day window below the platform x niche x size cohort median, no video at 3x or a strong-or-better label, flat follower growth; size-matched to the kept creators.

Size 2 (0.005 of kept), packaging-weak 0, provisional (selected from backfill; follower growth and the 60-day window are re-checked once 60 days of snapshots exist).

| Quota band | Negative creators |
| --- | --- |
| lt10k | 1 |
| 10k-100k | 1 |
| 100k-1m | 0 |
| 1m-plus | 0 |

| Creator | Followers | Flags |
| --- | --- | --- |
| tiktok:@phoenixtraumacenter | 233 | provisional |
| tiktok:@theaspieworld | 46,950 | provisional |

Anomaly accounts kept out of both groups: 17 (activity-unknown 10, repost-account 16, compilation-page 1, inactive 1).

## Digests for the top references

0 of 18 top references have a #557 digest. ralphy ref digest <url> writes a #557 bundle; ralphy trends link-digest <video> --ref <bundle> attaches it.

| # | Video | Digest |
| --- | --- | --- |
| 1 | https://www.tiktok.com/@carolinemiddelsdorf/video/7700302626205846817 | not yet |
| 2 | https://www.tiktok.com/@anxietyjosh/video/7682822331542064406 | not yet |
| 3 | https://www.tiktok.com/@childocdtherapist/video/7692503595198975262 | not yet |
| 4 | https://www.tiktok.com/@childocdtherapist/video/7691786588522597663 | not yet |
| 5 | https://www.tiktok.com/@doctorramani/video/7691392428221173006 | not yet |
| 6 | https://www.tiktok.com/@drdavidclarke/video/7697006742764277023 | not yet |
| 7 | https://www.tiktok.com/@drdavidclarke/video/7685934148023864606 | not yet |
| 8 | https://www.tiktok.com/@doctorramani/video/7699231217799023886 | not yet |
| 9 | https://www.tiktok.com/@anxiety_fitness/video/7696187023920614678 | not yet |
| 10 | https://www.tiktok.com/@anxiety_fitness/video/7680580969019018518 | not yet |
| 11 | https://www.tiktok.com/@thepsychdoctormd/video/7687659437678480654 | not yet |
| 12 | https://www.tiktok.com/@thepsychdoctormd/video/7675865935277853965 | not yet |
| 13 | https://www.tiktok.com/@mentalhealness/video/7695881083723730206 | not yet |
| 14 | https://www.tiktok.com/@theworkoutwitch/video/7694072049882451214 | not yet |
| 15 | https://www.tiktok.com/@theworkoutwitch/video/7688922156037721357 | not yet |
| 16 | https://www.tiktok.com/@mentalhealness/video/7698545005396282655 | not yet |
| 17 | https://www.tiktok.com/@drjulie/video/7673525465885314306 | not yet |
| 18 | https://www.tiktok.com/@drjulie/video/7676880242593729794 | not yet |

## YouTube coverage

360 kept main-group channels, 17585 listed Shorts (17557 undated), 28 dated through the watch page (Tier-1 budget).

| Creator | Size | Raw listing ratio | Views | Views/follower | Age (d) | Video |
| --- | --- | --- | --- | --- | --- | --- |
| youtube:@drjudithjoseph | micro | 414.8 | 995,537 | 16.62 | 64.6 | https://www.youtube.com/shorts/_mfBkgicvBk |
| youtube:@dr.jordansoper | micro | 220.7 | 96,656 | 6.58 | 28.5 | https://www.youtube.com/shorts/UF8XMqdY-Yg |
| youtube:@Secret_Mindset_1 | seed | 93.4 | 168,145 | 270.33 | 16.9 | https://www.youtube.com/shorts/2Zybl7OTpME |
| youtube:@dr.colleencira7562 | seed | 59.2 | 56,531 | 169.76 | 47.7 | https://www.youtube.com/shorts/v56gkoAFby8 |
| youtube:@lifeactuator | mid | 49.6 | 2,132,710 | 7.02 | 4.6 | https://www.youtube.com/shorts/4VgY1JcT9U8 |
| youtube:@motivationalpoints01 | micro | 49.3 | 1,331,029 | 97.16 | 17.4 | https://www.youtube.com/shorts/cfLuL7UplN4 |
| youtube:@Professor_Sol | micro | 48.2 | 1,203,824 | 26.63 | 56.9 | https://www.youtube.com/shorts/qhCoT_zWK_E |
| youtube:@lisasonni | mid | 42.5 | 106,163 | 0.64 | 15.8 | https://www.youtube.com/shorts/AB-LF-feaBo |
| youtube:@morgaanfoley | macro | 36.3 | 2,430,614 | 4.13 | 80.9 | https://www.youtube.com/shorts/9yYf6Q1Ay9Y |
| youtube:@orionkelly | mid | 35.8 | 139,616 | 0.59 | 88.5 | https://www.youtube.com/shorts/5a_w8Yap5HU |
| youtube:@carolinemiddelsdorf | micro | 23.2 | 139,031 | 2.7 | 10.9 | https://www.youtube.com/shorts/jNuwsYyIo5U |
| youtube:@puriravinder | mid | 21.4 | 320,332 | 1.44 | 44.9 | https://www.youtube.com/shorts/zOPpL6SLgHI |
| youtube:@DoctorRamani | mega | 20.2 | 826,720 | 0.38 | 27.6 | https://www.youtube.com/shorts/TcOoNXoQJkg |
| youtube:@Lucasbean | mid | 19.5 | 564,813 | 5.54 | 82.8 | https://www.youtube.com/shorts/skErENQssq4 |
| youtube:@DrScottEilers | mid | 16.5 | 123,945 | 0.32 | 63.5 | https://www.youtube.com/shorts/2yUfeLfp8aM |
| youtube:@VikramPresence | micro | 11 | 407,145 | 5.48 | 49 | https://www.youtube.com/shorts/f-DnMaheof8 |
| youtube:@TimFletcher | macro | 10.5 | 77,757 | 0.14 | 72.8 | https://www.youtube.com/shorts/C0NDjdZnod4 |
| youtube:@narcabusecoach | macro | 10.2 | 142,849 | 0.24 | 74.6 | https://www.youtube.com/shorts/mSorkz-OCdo |
| youtube:@mindsetmentorpodcast | mega | 9.4 | 160,169 | 0.15 | 9.8 | https://www.youtube.com/shorts/VP68-bXtDkc |
| youtube:@CoachAanand | mega | 9.1 | 146,361 | 0.1 | 21 | https://www.youtube.com/shorts/eVrg45J9ZWo |

What YouTube coverage lacks without the Data API key:

- post time for listing videos (channel Shorts tabs carry none without the YouTube Data API key), so YouTube videos are unscored: no multiplier, label, or copyability score
- likes, comments, and exact views in listings (views are rounded to 2-3 significant figures)
- duration in Shorts-tab listings (no length band)
- posting cadence and recency (activity unknown)
- the raw listing ratio above compares a dated candidate with the median of the creator's undated listing; it is a candidate filter, not the #556 score

## Notes

- Multipliers, labels, and copyability scores are Ralphy's own estimates from creator-relative baselines, not platform data.
- Groups below the minimum n (20 videos, 5 creators) show "insufficient data" instead of a claim.
- Videos come from the backfill cohort (first seen already mature); they set baselines and format distributions, never early-breakout predictions.
- Only 14 mature videos carry a content-format label (rule pre-labels from titles; the LLM label pass was off), so format rows are thin.

## Signals (#577)

Checkpoint run of the signal engine on 2026-10-29, same scratch corpus and scope as the report above (in-sample kept creators, main and negative groups, anomaly accounts excluded): `ralphy trends signals --niche psychology --lang en --contrast 10 --record`. The default listing window is the last 30 days; the 90-day column is the same run with `--since 90d`. Only TikTok videos are dated and scored, so every signal below is TikTok (47 kept creators, 40 of them in this scope after the language rule). Multipliers, engagement lifts and bands are Ralphy's own estimates, not platform data.

### Counts per signal type

| Signal | Last 30 days | Last 90 days | Detector |
| --- | --- | --- | --- |
| breakout | 17 | 30 | #556 percentile label `breakout` or `outlier` (here 27.2x / 11.3x with z >= 2) |
| small-account-breakout | 6 | 8 | seed / nano / micro creator, multiplier >= 10, views >= 10k, views >= 2x followers |
| early-momentum | 0 | 0 | not measurable yet: no video in the 90-day pool has two dated snapshots (one listing per creator so far) |
| near-miss | 48 (29 packaging-weak, 12 content-weak, 7 unclear) | 97 (50 / 27 / 20) | multiplier 2-4x, or 1-2x with an engagement lift >= 0.5; cause from likes / shares / saves per view vs the creator's norm (+-0.3 log units) |
| emerging-format | 1 | 2 | the same format or hook label at 3x+ for 2+ unrelated creators within 14 days |
| demand-signal | not collected | not collected | stub: no comment samples are stored for corpus videos |

The one emerging format in the 30-day window is the `question` hook: 7 videos at 3x or more from 5 unrelated creators between 3 and 15 October (thepsychdoctormd, adhddude, carolinemiddelsdorf, anxiety_fitness, childocdtherapist). It is not over-represented (9.0% of question-hook videos reach 3x against 12.6% for the niche) and it is no longer active (last hit 14 days ago), so it reads as a common hook that keeps working, not a rising one. Hook labels are rule pre-labels from titles, so this axis is thin.

### Adaptive widening and attention tiers

K = 20 qualifying references (transferable-candidate signals at or above the 50k-view noise floor). The base step (breakout, small-account breakout, early momentum, last 30 days) gave 12; lowering the threshold to near-miss added 14, so the engine stopped at 26 and recorded `base` or `near-miss-threshold` on each item. For the contrast set below, the engine walked the remaining steps: the 90-day window added one more English creator (`extend-window`) and the Russian side of the niche added the tenth (`other-languages`), because only 9 distinct English creators have a transferable candidate above the noise floor in 90 days.

Attention tiers of the 400 creators in scope: TikTok 16 `watched`, 13 `background`, 11 `dropped` (no post in 60+ days), 0 `hot` (no video has the two snapshots momentum needs); all 360 YouTube channels are `background` with "activity unknown" because their videos carry no post times. Tiers are computed on read in `ralphy trends status` and `trends signals`; since the #577 follow-up, `trends refresh --due` schedules by these computed tiers (`--tier-source stored` keeps the #556 tiers).

### Transferable-candidate references (widened set)

| Step | Signal | Creator | Size | Multiplier | Views | Views / follower | Cause / engagement per view vs norm |
| --- | --- | --- | --- | --- | --- | --- | --- |
| base | small-account breakout | carolinemiddelsdorf | micro | 373x | 373,100 | 4.5 | |
| base | small-account breakout | childocdtherapist (4 videos) | micro | 77x / 44x / 32x / 25x | 1.9M / 1.1M / 760k / 599k | 36 / 21 / 15 / 11 | |
| base | breakout | doctorramani (2) | mid | 133x / 32x | 2.5M / 377k | 7.7 / 1.2 | |
| base | breakout | drdavidclarke (2) | mid | 59x / 18x | 175k / 72k | 0.43 / 0.17 | |
| base | breakout | anxiety_fitness | mega | 40x | 859k | 0.80 | |
| base | breakout | mentalhealness | mega | 19x | 322k | 0.16 | |
| base | breakout | theworkoutwitch | mega | 15x | 377k | 0.16 | |
| near-miss-threshold | near-miss | childocdtherapist (4) | micro | 2.7-3.8x | 66k-95k | 1.3-1.8 | 2 unclear, 2 content-weak (0.6x) |
| near-miss-threshold | near-miss | thepsychdoctormd (3) | mega | 2.2-3.1x | 50k-68k | 0.04-0.05 | packaging-weak (1.4-2.6x) |
| near-miss-threshold | near-miss | theworkoutwitch (5) | mega | 2.1-3.6x | 52k-90k | 0.02-0.04 | 3 packaging-weak (2.0-3.2x), 2 content-weak (0.6x) |
| near-miss-threshold | near-miss | mentalhealness, anxiety_fitness | mega | 3.4x, 3.9x | 62k, 87k | 0.03, 0.08 | packaging-weak (1.4x), unclear |

Below the noise floor and therefore not references: drmscoggins (nano, 1.7k followers) at 76x and 33.6k views, the strongest small-account jump in the window, and most near-misses of seed and nano creators (around 1k views). Each near-miss carries its improvement hypothesis in the JSON (`improvement`): packaging-weak keeps the body and reworks the first 1-2 s, first frame, on-screen hook line and caption; content-weak keeps the hook and fixes the payoff.

### Within-creator contrast (top 10)

Each signal video is compared with the 3 videos of the same creator closest to its median (|ln multiplier| smallest, ties broken by distance in time), on metadata (length, posting hour, hook / format label, hashtags), captions, and engagement per view. Free subtitles and #557 contact sheets were planned for these 10 signals and their 30 controls, but the first `yt-dlp` video download returned HTTP 403 from TikTok's video page, so collection stopped there (no retry, no cookies): the hypotheses below rest on metadata and captions only, not on frames or speech. Captions are paraphrased.

| # | Creator (size, step) | Signal vs controls | Hypothesis | Class |
| --- | --- | --- | --- | --- |
| 1 | carolinemiddelsdorf (micro, base) | 373x, 5 s vs 10-106 s at 0.9-1.1x | A 5-second single-claim warning about someone else's unhealed trauma, against reflective and part-2 posts; interactions per view far below the creator's norm (no comments), so reach came from replays of a very short loop | transferable (format and length) |
| 2 | childocdtherapist (micro, base) | 77x, 80 s vs 68-88 s at ~1x | Same face and length; the caption opens on a parent's specific question (why the child's OCD is worse at home) where the controls state general OCD facts; likes per view above the norm, shares and saves below, so the opening did the work | transferable (hook) |
| 3 | doctorramani (mid, base) | 133x, 57 s vs 78-174 s guest promos | A celebrity release read through the narcissistic-abuse lens while it was news; controls are long guest-conversation promos with lesser-known names | creator-bound (celebrity timing) |
| 4 | drdavidclarke (mid, base) | 59x vs 64-288 s at ~1x | One concrete domestic scenario (no help with chores or the kids) instead of abstract "here is why narcissists..." explanations; shares per view 3.4x the creator's norm, the send-it-to-someone pattern; length is not the cause | transferable (topic angle) |
| 5 | anxiety_fitness (mega, base) | 40x, 30 s vs 25-34 s, mostly the same posting hour (11 UTC) | An inverted how-to (how to make a panic attack worse) against the same creator's straight how-to and question hooks; it turns advice into a self-check; likes and shares per view above the norm | transferable (hook) |
| 6 | mentalhealness (mega, base) | 19x vs same persona at ~1x | The self-identified narcissist persona reacting to a widely known true-crime case in the news; controls use the same persona on lesser-known figures | creator-bound (persona and news) |
| 7 | theworkoutwitch (mega, base) | 15x, 28 s vs 25-29 s, same caption | Signal and two controls share the same quiz call-to-action caption, length and posting hour, so the difference sits in the opening line or first frame; engagement per view below the norm on all three; the signal uses a borrowed sound. Low confidence: frames not seen | transferable (opening; tentative) |
| 8 | thepsychdoctormd (mega, near-miss) | 3.1x, 80 s vs 9-14 s clips | Packaging-weak near-miss: a dense summary of an ADHD research review with shares and saves per view about 3.4x the norm; the caption opens as a continuation that assumes context. Remake with the most surprising finding as the first line | transferable (save-worthy summary format) |
| 9 | anxietyjosh (micro, extend-window) | 66x vs 49-60 s at 0.1-0.5x | The caption starts with #ad (a paid public-service partnership), and interactions per view are 15-40x below the creator's norm: paid distribution, not the format | creator-bound (sponsored) |
| 10 | fasacasa (micro, Russian side, other-languages) | 273x, 175 s vs 119-139 s at 1.2-1.5x | Posted right after the school-start date with a narcissistic-mother angle, an open question to the audience, and a named music track where the controls use original audio and self-worth affirmations; the reusable unit is the seasonal hook | transferable (calendar hook) |

Seven of ten read as transferable: two hook changes (a specific parent question, an inverted how-to), one topic angle (a concrete everyday scenario), two format choices (a 5-second single claim, a dense saveable summary), one seasonal hook, and one tentative opening change. Three are creator-bound (celebrity timing, persona plus news, a paid placement). The hypotheses and classes are stored on the picks in the prediction ledger and shown by `trends signals` (`why`, `transferable`).

### Scale-up estimate and prediction ledger

Scale-up for every transferable candidate: **no own baseline yet** (#558 has 0 own outcomes on TikTok; 3 are needed, and no own follower count is stored). Each pick still stores its relative band, our post at X^0.25 to X^0.5 times our own median views (for example 4.4x-19.3x for the 373x video, 3.0x-8.8x for 77x), so precision can be checked once outcomes exist; with an own follower count the band is 10-50% of the reference's views per follower times our followers.

Prediction ledger: one JSON Document per niche scope (`trend-prediction-ledger-psychology-en`, kind `custom`, append-only revisions; 3 revisions, 29 picks: the 26 widened references, the 2 extra contrast picks, and the emerging `question` hook). Each pick carries the signal, its widening step, evidence, the own band, a 14-day spread prediction where the video has a format or hook label, and the hypothesis. `ralphy trends precision --niche psychology --lang en` reports "insufficient data" for every signal type: no pick is linked to a produced Unit yet (`ralphy trends pick link <pick-key> --unit <unit>` once one is made), and the first spread checks resolve 14 days after detection (2026-11-12).

### Not covered yet

- `early-momentum`, near-miss "momentum that stalled", and `hot` tiers need two or more dated snapshots per video; they fill as `trends refresh` runs.
- `demand-signal` is a stub that reports "not collected" until comment samples exist.
- Contact sheets and subtitles for the contrast set: blocked on the first TikTok download (HTTP 403).
- Paid placements: the `#ad` reference above shows that sponsored videos need an exclusion rule before they reach the reference list.
