# Personas — archetypes (RU UGC)

8 base archetypes, adapted from `TheMattBerman/ugc-factory-skill/CHARACTER_LIBRARY.md`
for a Russian-speaking UGC audience. Used as a vibe-anchor when creating
a concrete persona via `bun run ralph -- persona create --archetype <key> ...`.

An archetype is a **vibe + context**, not a specific person. A concrete persona
inherits from the archetype and overrides: name, voice clone (ElevenLabs), exact
appearance, specific props.

## Summary table

| Key | Archetype | Demo | Setting | Energy | Best for |
|---|---|---|---|---|---|
| `student-grind` | Hustling student | 19-23, M/F | Dorm, café, laptop on lap | Slightly nervous, energetic | EdTech, financial apps, productivity |
| `it-remote` | Remote IT worker | 26-34, M | At a desk at home, kitchen, coffee shop | Tired-ironic | Dev tools, AI products, SaaS |
| `courier-driver` | Courier / taxi driver | 22-35, M | Car, street, building entrance | Pragmatic, direct | Gig work apps, financial, mobile |
| `mom-blogger` | Mom blogger | 28-38, F | Kitchen, living room, nursery | Warm, sincere | Beauty, household, kids, food |
| `gen-z-energy` | Energetic Gen-Z | 18-24, M/F | Bedroom, street, subway | Loud, fast, meme-y | Fashion, music, social platforms |
| `startup-founder` | Startup founder | 28-38, M/F | Coworking, home office, café | Confident-tired | B2B SaaS, dev tools, AI agents |
| `marketer-perf` | Performance marketer | 26-34, M/F | Office, monitor with a dashboard | Dry-data, staccato | Ad tech, analytics, performance |
| `wfh-worker` | Remote employee | 24-40, M/F | Home office, living room | Calm, "just like everyone" | Productivity, comms, hardware |

## Detail

### `student-grind` — Hustling student

- **Demo:** 19-23, guy or girl, region/Moscow.
- **Appearance:** simple hoodie/shirt, hair however is comfortable, a slightly
  sleep-deprived look, glasses if IT/math major.
- **Setting:** dorm, cramped rental, coffee shop with an open laptop, library
  desk. Background with books / a poster / an energy-drink can.
- **Personality:** energetic, slightly nervous, talks fast on the same wavelength.
  Frame: "just figured it out" → "by the way, let me show you now".
- **Speaking style:** colloquial, interjections ("well, basically", "in short",
  "listen"), no business terms.
- **Best for:** EdTech, financial apps for students,
  productivity, summary tools, AI tutoring.

### `it-remote` — Remote IT worker

- **Demo:** 26-34, male (a female variant exists, not the default), Moscow/St. Petersburg/remote.
- **Appearance:** hoodie / oversized tee, black/dark, 1-2 week beard,
  medium-length hair, AirPods may be sticking out. Glasses optional.
- **Setting:** home study with a mechanical keyboard, kitchen with a
  pour-over, an empty coffee shop during off-hours. Dark/warm light.
- **Personality:** tired-ironic, deadpan. "I did this 5 times and
  every time everything broke." Not pompous, not motivational.
- **Speaking style:** short phrases, technical jargon without explanation
  (assumes the viewer is one of us), a pause after a bombshell.
- **Best for:** dev tools, AI products for developers, SaaS, infra,
  productivity, code editors, terminal apps.

### `courier-driver` — Courier / taxi driver

- **Demo:** 22-35, male, any region, frequently a non-Moscow accent.
- **Appearance:** a delivery-service jacket / just a warm coat, a beanie,
  phone in a mount.
- **Setting:** car (POV from the cabin), building entrance, elevator, sidewalk near a
  restaurant.
- **Personality:** pragmatic, direct, no extra emotion. "Doesn't work —
  doesn't work." No romanticism.
- **Speaking style:** simple sentences, facts, concrete numbers
  (earned X, drove Y, spent Z).
- **Best for:** gig-work apps, finance for the self-employed, navigation,
  mobile services, bank cards.

### `mom-blogger` — Mom blogger

- **Demo:** 28-38, female, region/average.
- **Appearance:** comfortable home clothes (sweater, long-sleeve), minimal
  makeup, natural hair, sometimes holding a baby in frame.
- **Setting:** kitchen (counter), living room (couch), nursery (on the
  floor with a toy), less often street/store.
- **Personality:** warm, sincere, conversational and trusting. "I'll tell you
  like a friend." Can laugh at herself.
- **Speaking style:** soft intonation, addressing the viewer informally,
  diminutives ("little curds", "little one").
- **Best for:** beauty, household, kids' products, ready meals, food delivery,
  family banking products.

### `gen-z-energy` — Energetic Gen-Z

- **Demo:** 18-24, M/F, urban.
- **Appearance:** bright colors, accessories (chains, backpack, pop-art headphones),
  may have dyed hair, bold makeup/none.
- **Setting:** bedroom with a lamp/posters, street/subway, primark-fitting-style,
  TikTok house vibes.
- **Personality:** loud, fast, meme-y. Intonation shifts every 2s.
  Reference-heavy (other trends, memes, anime).
- **Speaking style:** Gen-Z slang (but not overdone — that reads as toxic), abbreviations,
  filler words.
- **Best for:** fashion, music apps, social platforms, dating, snack/energy
  brands, gaming.

### `startup-founder` — Startup founder

- **Demo:** 28-38, M or F, urban, Moscow/EU/SF.
- **Appearance:** simple t-shirt or henley, minimal, may have a watch,
  hair neat but not pretentious.
- **Setting:** coworking (other desks visible behind a blur), home office
  with a whiteboard, café with a laptop.
- **Personality:** confident-tired. "We tried X, it didn't work, now Y."
  Experienced, no bullshit.
- **Speaking style:** concrete numbers (MRR, retention), product names,
  no "game-changing" / "amazing".
- **Best for:** B2B SaaS, dev tools, AI agents, productivity for teams,
  fintech for business.

### `marketer-perf` — Performance marketer

- **Demo:** 26-34, M/F, urban.
- **Appearance:** business casual, shirt/blouse, neat hair,
  glasses often.
- **Setting:** open-space office with monitors, charts/dashboards visible in the background.
- **Personality:** dry-data, staccato. "In 2 weeks CTR rose from 1.2%
  to 3.8%." No lyricism.
- **Speaking style:** numeric facts, abbreviations (CTR, CPA, ROAS), a pause
  for effect after a bombshell number.
- **Best for:** ad tech, analytics, performance-marketing tools, growth tools,
  attribution.

### `wfh-worker` — Remote employee

- **Demo:** 24-40, M/F, average.
- **Appearance:** ordinary home clothes (t-shirt, hoodie), no
  pretensions, "just like any of us".
- **Setting:** home office (bookshelf / plain background), living room
  (couch), kitchen at lunch.
- **Personality:** calm, neutral, "one of us". No drama,
  no motivational tone.
- **Speaking style:** ordinary conversational speech, no slang and no jargon.
- **Best for:** productivity, comms (Slack/chats), hardware (cameras,
  microphones), ergonomics, time-management.

## Usage

Create a concrete persona based on an archetype:

```bash
bun run ralph -- persona create \
  --name "Aleks IT 27" \
  --archetype it-remote \
  --voice "elevenlabs:eleven_multilingual_v2/<voice-id>" \
  --setting "home office, mechanical keyboard, dark room" \
  --energy "deadpan, ironic"
```

An archetype is a vibe-anchor, a persona is a concrete person with a face and a voice.
