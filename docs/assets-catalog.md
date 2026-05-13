# Assets catalog

> Auto-generated from the `ralphy-assets` companion-repo manifest. **Manifest is the source of truth — regenerate this file with `ralphy assets catalog --write` after any manifest change.**

Manifest version: `2` · Updated: `2026-05-13T13:18:01.564Z`

## How the layers fit together

- **`required`** — template-bound mandatory assets. Auto-pulled when you run `ralphy template use <slug>`. Listed here for transparency; you rarely pull these directly.
- **`pool`** — generic, reusable assets grouped by **kind** (open-ended: gameplay-loops, italian-brainrot-characters, trend-music, stock-broll, and future additions). Pull individual items on demand with `ralphy assets pull-pool <kind>/<slug>`. The agent should consult this catalog before generating prompts that reference real-world IP / characters / footage.
- **`examples`** — ready-made example mp4 outputs per template, for visual reference / regression baselines.

CLI cheatsheet:
```
ralphy assets list                                    # everything
ralphy assets list --kind italian-brainrot-characters # one pool kind
ralphy assets list --template italian-brainrot        # required + matching pool items
ralphy assets pull-pool <kind>/<slug>                 # download one pool item
ralphy assets pull-pool <kind>/<slug> --install <pid> # download + copy into a project
ralphy assets pull <template-slug>                    # all required for a template
```

## Required (per-template, auto-pulled)

| Template | Key | Size | Description |
|---|---|---|---|
| `brainrot-ai-meme` | `brainrot-ai-meme/cs-surf-loop.mp4` | 21.49 MB | Default CS:GO surf gameplay loop for the brainrot-ai-meme template — 56s, 1080x960, h264+aac, neon ramps. Used as the bottom-half hypnotic-motion layer when the user has no own footage. Auto-pulled on `ralphy template use brainrot-ai-meme` and copied to assets/uploaded/gameplay-loop.mp4 (the path the template's reference-required gate checks). |
| `soviet-nostalgic` | `soviet-nostalgic/trend-soviet-bed.mp3` | 0.94 MB | Canonical Soviet trend bed (60s). Required by the soviet-nostalgic template — do not generate a substitute, the recognizability is half the format. |

## Pool (generic, by kind)

### `italian-brainrot-characters` (33)

Canonical Italian Brainrot meme character reference images. Used by the italian-brainrot template as image-to-image references for character regeneration in new contexts, and as canonical hero images for prompt-writing. Each character is an AI-generated TikTok meme that went viral in 2024-2025.

**License (category default):** `fair-use-meme-reference` · attribution required

| Slug | Size | Works with | License | Description |
|---|---|---|---|---|
| `ballerina-cappuccina` | 101.6 KB | `italian-brainrot` | fair-use-meme-reference | Anonymous TikTok user, part of the wider Italian brainrot trend that began with Tralalero Tralala Created as part of the 'Italian brainrot' trend, combining AI-generated imagery with nonsensical Italian-sounding phrases and robotic voice elements |
| `blueberrinni-octopussini` | 122.9 KB | `italian-brainrot` | fair-use-meme-reference | A surreal Italian brainrot character combining a blueberry and an octopus, residing in the deep sea among coral reefs Created on March 10th, 2025 as part of the Italian Brainrot trend featuring AI-generated animal-fruit hybrids |
| `bobrito-bandito` | 35.3 KB | `italian-brainrot` | fair-use-meme-reference | A chaotic and absurd character from the Italian brainrot meme universe, often depicted as a rogue beaver with exaggerated outlaw traits, appearing in games and memes. Community-generated (no single confirmed creator) |
| `bombardiro-crocodilo` | 101.1 KB | `italian-brainrot` | fair-use-meme-reference | Originally posted by TikTok user @armenjiharhanyan on February 20, 2025 Part of the 'Italian brainrot' trend, combining AI-generated Italian speech with surreal, bizarre imagery |
| `bombombini-gusini` | 39.6 KB | `italian-brainrot` | fair-use-meme-reference | An AI-generated Italian brainrot meme featuring a goose hybridized with a fighter jet or bomber plane, known for its surreal visuals and chaotic Italian narration Originally posted by TikTok user @armenjiharhanyan on March 5, 2025 |
| `boneca-ambalabu` | 68.6 KB | `italian-brainrot` | fair-use-meme-reference | An AI-generated Indonesian brainrot meme character featuring a hybrid creature with a frog's head, car tire body, and human legs, known for its sinister narrative and viral spread across social media Originally posted by TikTok user @ofuscabreno on February 2nd, 2025 |
| `brr-brr-patapim` | 93.5 KB | `italian-brainrot` | fair-use-meme-reference | An AI-generated Italian brainrot meme character depicted as a hybrid between a tree forest and a monkey with large feet, known for chaotic energy and nonsensical Italian phrases Originally posted by TikTok user @ofuscabreno in February 2025 |
| `brri-brri-bicus-dicus-bombicus` | 92.7 KB | `italian-brainrot` | fair-use-meme-reference | Originally believed to have emerged from TikTok's AI-generated content creators in early 2025 Part of the 'Italian brainrot' trend, combining AI-generated Italian speech with surreal, bizarre imagery of anthropomorphic animals in historical contexts |
| `burbaloni-lulilolli` | 99.2 KB | `italian-brainrot` | fair-use-meme-reference | Unknown, emerged as part of the broader Italian brainrot trend in early 2025 Part of the 'Italian brainrot' trend, combining AI-generated pseudo-Italian speech with surreal, bizarre imagery of capybaras |
| `cappuccino-assassino` | 83.8 KB | `italian-brainrot` | fair-use-meme-reference | An AI-generated Italian brainrot meme character depicted as an anthropomorphic coffee cup dressed as a ninja with katanas, part of the viral Italian brainrot trend TikTok user @alexey_pigeon, who also created other Italian brainrot characters like Frigo Camelo and Chimpanzini Bananini |
| `chef-crabracadabra` | 74.1 KB | `italian-brainrot` | fair-use-meme-reference | Unknown, likely originated from AI-generated content that spread virally across social media platforms Part of the broader 'Italian brainrot' trend, combining AI-generated imagery with pseudo-Italian phrases and absurdist humor |
| `chimpanzini-bananini` | 67.1 KB | `italian-brainrot` | fair-use-meme-reference | An AI-generated Italian brainrot meme character depicted as a hybrid between a monkey or chimpanzee and a banana Originally posted by TikTok user @alexey_pigeon on March 13, 2025 |
| `cocofanto-elefanto` | 99.2 KB | `italian-brainrot` | fair-use-meme-reference | Unknown, but popularized through multiple TikTok creators including @italienbrainrot and others Part of the 'Italian brainrot' trend, combining AI-generated Italian speech with surreal, bizarre imagery of animals and objects |
| `frigo-camelo` | 80.0 KB | `italian-brainrot` | fair-use-meme-reference | An AI-generated Italian brainrot meme character depicted as a camel with a refrigerator for a body and Timberland boots, known for its melancholic journey across European cities Originally posted by TikTok user @ofuscabreno in February 2025, the same creator behind other AI brainrot animals like Boneca Ambalabu and Brr Brr Patapim |
| `frulli-frulla` | 59.9 KB | `italian-brainrot` | fair-use-meme-reference | Part of the broader Italian brainrot trend, with various creators contributing to its development Emerged as part of the AI-generated Italian animal meme trend, featuring phonk music remixes and surreal desert scenarios |
| `garam-mararam-madu-dung-dung` | 64.1 KB | `italian-brainrot` | fair-use-meme-reference | A viral meme featuring anomalous salt and honey storage containers depicted as supernatural beings, part of the Anomali TikTok trend influenced by Italian brainrot Originally created by TikTok user @noxaasht |
| `giraffa-celeste` | 39.7 KB | `italian-brainrot` | fair-use-meme-reference | Originally posted by TikTok user @ofuscabreno on February 15, 2025 Part of the 'Italian brainrot' trend, featuring AI-generated Italian poetry with space and celestial themes |
| `glorbo-fruttodrillo` | 83.0 KB | `italian-brainrot` | fair-use-meme-reference | An AI-generated Italian brainrot meme character featuring a watermelon-alligator hybrid with a crocodile head and a striped watermelon body Part of the Italian brainrot meme trend, featuring AI-generated animal characters with Italian-sounding names |
| `graipussi-medussi` | 90.7 KB | `italian-brainrot` | fair-use-meme-reference | A surreal AI-generated character combining grapes and jellyfish, known for its sticky tentacles and memory-erasing touch. Unknown, part of the Italian Brainrot trend |
| `il-cacto-hipopotamo` | 63.8 KB | `italian-brainrot` | fair-use-meme-reference | A surreal AI-generated Italian brainrot meme character combining features of a cactus and a hippopotamus. Il Cacto Hipopotamo is a hybrid creature that merges the rugged defense of a cactus with the raw power of a hippopotamus. Often depicted wearing sandals on its cactus torso, this character embodies the absurdity and surrealism characteristic of the Italian brainrot meme trend. Its appearances are marked by vibrant colors, exaggerated features, and nonsensical scenarios, contributing to its popularity across social media platforms. |
| `la-vaca-saturno-saturnita` | 76.4 KB | `italian-brainrot` | fair-use-meme-reference | Unknown, emerged from the Italian brainrot community Part of the 'Italian brainrot' trend, blending surreal AI-generated imagery with cosmic and bovine themes |
| `lirili-larila` | 68.1 KB | `italian-brainrot` | fair-use-meme-reference | Unknown, emerged as part of the collective Italian brainrot meme universe Part of the 'Italian brainrot' trend, combining AI-generated imagery with absurd, nonsensical elements and Italian cultural references |
| `orangutini-ananasini` | 67.2 KB | `italian-brainrot` | fair-use-meme-reference | TikTok user @alexey_pigeon Emerged as part of the 'Italian brainrot' trend, blending AI-generated Italian speech with surreal, absurd imagery |
| `pot-hotspot` | 31.6 KB | `italian-brainrot` | fair-use-meme-reference | An AI-generated Indonesian brainrot meme character featuring a skeleton with a human-like face desperately seeking Wi-Fi hotspot access from friends Part of Indonesian brainrot trend, exact original creator unclear |
| `rhino-toasterino` | 80.7 KB | `italian-brainrot` | fair-use-meme-reference | A character from the Italian Brainrot meme trend, depicted as a rhino-toaster hybrid. Rhino Toasterino is a viral character within the Italian Brainrot meme ecosystem, known for its surreal depiction of a rhino combined with toaster elements. It has gained popularity through short-form videos on platforms like TikTok and YouTube, often featured in absurd and humorous scenarios that play on Italian stereotypes and internet culture. |
| `tigrrullini-watermellini` | 145.6 KB | `italian-brainrot` | fair-use-meme-reference | An AI-generated Italian brainrot meme character featuring a tiger's head on a watermelon body, creating a surreal and absurd hybrid creature Part of the Italian brainrot trend, exact original creator unclear |
| `tracotucotulu-delapeladustuz` | 56.3 KB | `italian-brainrot` | fair-use-meme-reference | An AI-generated Italian brainrot character that combines a camel with a Volkswagen Beetle, creating a surreal six-legged automotive-biological hybrid Originally by @turzin_sfd, adopted by Italian brainrot community |
| `tralalero-tralala` | 67.7 KB | `italian-brainrot` | fair-use-meme-reference | Originally posted by TikTok user @eZburger401 (account since banned), later popularized by various content creators Part of the 'Italian brainrot' trend, combining AI-generated Italian speech with surreal, bizarre imagery |
| `tric-trac-baraboom` | 58.1 KB | `italian-brainrot` | fair-use-meme-reference | No single creator; it is the collective result of a viral trend on TikTok. Part of the 'Italian brainrot' trend, combining AI-generated Italian speech with surreal, bizarre imagery. |
| `trulimero-trulicina` | 63.6 KB | `italian-brainrot` | fair-use-meme-reference | Originally posted by TikTok user @zanahoriatan33 on January 28, 2025, with the 'Trippi Troppi' version by @1raidex_ on February 18, 2025 Part of the 'Italian brainrot' trend, featuring AI-generated animal hybrids with nonsensical Italian audio |
| `tung-tung-tung-sahur` | 78.4 KB | `italian-brainrot` | fair-use-meme-reference | Originally created by TikTok user @noxaasht Based on a Ramadan tradition in Indonesia where drummers wake neighborhoods for Sahur (pre-dawn meal before fasting) |
| `u-din-din-din-din-dun` | 52.6 KB | `italian-brainrot` | fair-use-meme-reference | Unknown, but popularized through multiple TikTok creators in early 2025 Part of the broader 'Italian brainrot' trend, combining AI-generated Italian speech with surreal, bizarre imagery and transformation narratives |
| `zibra-zubra-zibralini` | 94.3 KB | `italian-brainrot` | fair-use-meme-reference | A surreal AI-generated Italian brainrot character featuring a zebra with a watermelon body and human legs, known for its haunting stare and absurd fruit-animal hybrid design Part of Italian brainrot trend, popularized by various TikTok creators including @alexey_pigeon |

### `trend-music` (27)

Recognizable horror / dread music beds heavily used on horror-TikTok in 2024-2026. Sourced from the canonical 'Horror TikTok' YouTube playlist (PLan_O7sHy-ObDv02Jn67zodPb1MrdoIvo). Each item ships the full mp3 plus a pre-rendered 20-second hook clip (the loudest middle-of-track region with fade-in/out) under `hooks/`. The agent should pick a track whose `mood` and `tags` match the scenario, then either drop the hook clip directly (TikTok-style) or use the full mp3 and trim in the composition.

**License (category default):** `fair-use-meme-reference`

| Slug | Size | Works with | License | Description |
|---|---|---|---|---|
| `baldis-basics-school-theme-slowed` | 5.59 MB | _any_ | fair-use-meme-reference | Slowed-down version of Baldi's Basics school theme. Used for cursed-school / liminal-classroom TikToks. |
| `broken-piano-nocopyright` | 3.50 MB | _any_ | fair-use-meme-reference | Detuned-piano horror bed, no-copyright. Drop-in for haunted-piano / abandoned-house TikToks. |
| `caretaker-childishly-fresh-eyes` | 4.16 MB | _any_ | fair-use-meme-reference | Track from Leyland Kirby's 'Everywhere at the End of Time' project. Used in dementia / memory-decay horror TikToks and analog-horror montages. |
| `caretaker-its-just-a-burning-memory` | 4.89 MB | _any_ | fair-use-meme-reference | Opening track of EATEOT Stage 1. Crackly 1930s ballroom loop — TikTok backdrop for nostalgia-horror and liminal-corridor edits. |
| `caretaker-libets-delay` | 4.76 MB | _any_ | fair-use-meme-reference | Track from Stage 4 of EATEOT, named after the neuroscientific delay between will and awareness. Used for dissociation / depersonalization horror TikToks. |
| `crystal-castles-kerosene-slowed` | 4.92 MB | _any_ | fair-use-meme-reference | Slowed-and-reverb edit of Crystal Castles 'Kerosene'. One of the canonical horror-TikTok beds for liminal / surreal footage. Heavy distortion drop ~mid-track. |
| `crystal-castles-transgender-slowed` | 4.68 MB | _any_ | fair-use-meme-reference | Slowed+reverb of Crystal Castles 'Transgender'. Dreamy-dread atmosphere for liminal / dissociation footage. |
| `crystal-castles-untrust-us` | 3.35 MB | _any_ | fair-use-meme-reference | Original (not slowed) version of Crystal Castles 'Untrust Us'. The 'haunted lullaby' loop sampled across horror TikToks for the last decade. |
| `daisy-bell-creepy` | 3.78 MB | _any_ | fair-use-meme-reference | The 1961 IBM 704 synthesized 'Daisy Bell' — the first computer-sung song, now a horror staple (HAL 9000 reference). TikTok dying-AI POVs. |
| `dead-silence-soundtrack` | 4.12 MB | _any_ | fair-use-meme-reference | Music-box motif from the 2007 horror film 'Dead Silence'. Recurrent on TikTok 'creepy doll / cursed object' POVs. |
| `fnaf-4-music-box` | 2.98 MB | _any_ | fair-use-meme-reference | Music-box motif from FNaF 4. Standard cursed-childhood / haunted-toy TikTok cue. |
| `hide-and-seek-lizz-robinett` | 3.29 MB | _any_ | fair-use-meme-reference | Lizz Robinett's a-cappella cover of Imogen Heap's 'Hide and Seek'. THE archetypal sad-creepy a-cappella drop for horror TikToks, especially 'left alone / abandoned' POVs. |
| `hide-the-soul-possibly-in-michigan` | 3.10 MB | _any_ | fair-use-meme-reference | Cult horror-musical excerpt from the 1983 short 'Possibly in Michigan'. TikTok 'cannibal-girls' / surreal-horror trend. |
| `jumpstyle1-creepy` | 1.75 MB | _any_ | fair-use-meme-reference | Short creepy jumpstyle edit. High-tempo dread / jump-scare loop. |
| `kero-kero-bonito-id-rather-sleep-slowed` | 2.88 MB | _any_ | fair-use-meme-reference | Slowed+reverb of KKB's 'I'd Rather Sleep'. Used for 'i wish this was a dream' POVs and depressed-creature edits. |
| `lovely-bastards-horror` | 2.68 MB | _any_ | fair-use-meme-reference | Aggressive horror remix used for jump-cut chase / monster-POV TikToks. |
| `maglo-never-tiktok` | 4.31 MB | _any_ | fair-use-meme-reference | Mag.lo's 'Never' — a TikTok-native sad-horror track. Used for unrequited-love / ghost-of-the-past edits. |
| `mandela-catalogue-amazing-grace` | 3.11 MB | _any_ | fair-use-meme-reference | Distorted hymn-style backing track from the Mandela Catalogue analog-horror series. Used in TikTok edits for slow-burn dread reveals and 'when something's wrong' face-cam reactions. |
| `old-doll-bluerra-sai` | 4.57 MB | _any_ | fair-use-meme-reference | Original creepy-doll-music-box composition by Bluerra_sai, popular on horror-dollhouse TikToks. |
| `phantomimes-song-extended` | 3.01 MB | _any_ | fair-use-meme-reference | Extended version of the Phantomimes horror theme. Bouncy-circus-meets-dread aesthetic. |
| `porter-robinson-goodbye-to-a-world-slowed` | 3.31 MB | _any_ | fair-use-meme-reference | Slowed/pitched-down edit of Porter Robinson's 'Goodbye To A World'. 'End of the world' melancholic-horror bed. |
| `privet-privet-2009-slowed` | 2.83 MB | _any_ | fair-use-meme-reference | Russian-internet horror edit, slowed phonk-adjacent. Widely used in slavic-TikTok нагнетающий dread loops. |
| `sound-production-gin-tiktok-synth` | 2.03 MB | _any_ | fair-use-meme-reference | Royalty-style synth-tension bed by Sound Production Gin. THE generic TikTok horror sting heard under thousands of recent dread videos. |
| `suspense-horror-piano-music-box` | 4.37 MB | _any_ | fair-use-meme-reference | Generic suspense piano + music-box bed, royalty-free style. Drop-in for childhood-horror / haunted-nursery POVs without copyright concerns. |
| `the-sound-of-the-fear` | 3.95 MB | _any_ | fair-use-meme-reference | Generic horror drone bed often used as a low-cost, copyright-safe substitute for branded horror cues. |
| `tili-tili-bom` | 4.25 MB | _any_ | fair-use-meme-reference | Russian lullaby 'Tili Tili Bom' — folk-horror bed about a nighttime creature stalking children. Trending across slavic horror TikToks 2024-2026. |
| `zelda-majoras-mask-song-of-unhealing` | 3.83 MB | _any_ | fair-use-meme-reference | Reverse / unhealing variation of the Song of Healing from Majora's Mask. Classic 'lost media / haunted cartridge' TikTok cue. |

## Examples (rendered mp4s per template)

_None registered._

---

_Regenerate with `ralphy assets catalog --write`._
