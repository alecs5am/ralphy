# Italian Brainrot — hooks

Opening 0-2s. The hook is **the character's call-sign chant** — same pattern across the format. Don't write English hooks; the gibberish IS the hook.

## Canonical call-signs (use these verbatim)

| Character | Call-sign | Notes |
|---|---|---|
| Tralalero Tralala | `Tralalero tralala, tralalero tralala` | Sing-song. The original; viewers know it. |
| Tung Tung Tung Sahur | `Tung tung tung tung tung tung sahur` | Wooden percussion cadence; lean into the drumbeat. |
| Ballerina Cappuccina | `Ballerina cappuccina, ballerina cappuccina` | Dance-cadence; gentle pirouette feel. |
| Bombardiro Crocodilo | `Bombardiro crocodilo, bombardiro crocodilo` | Militant march; "wojna! wojna!" interjection optional. |
| Bombombini Gusini | `Bombombini gusini` | Same militant march, goose variant. |
| Chimpanzini Bananini | `Chimpanzini bananini, chimpanzini bananini` | Up-pitched chant. |
| Cappuccino Assassino | `Capu capu cappuccino assassino` | Whisper-aggressive. |
| Lirili Larila | `Lirili lirili lirilì larilà` | Lullaby cadence. |
| Brr Brr Patapim | `Brr brr brr brr patapim, il mio cappello è pieno di lampone` | Half-sung; longer phrase. |
| Trippi Troppi | `Trippi troppi, trippi troppi` | Fast tempo. |
| Boneca Ambalabu | `Boneca ambalabu, boneca ambalabu, boneca ambalabu` | Tribal-chant feel. |
| Trulimero Trulicina | `Trulimero trulicina` | Folk-song-ish. |
| Glorbo Fruttodrillo | `Glorbo fruttodrillo, glorbo fruttodrillo` | Bubble-up tempo. |
| Frigo Camelo | `Frigo camelo, frigo camelo` | Cold deadpan. |
| Burbaloni Lulilolli | `Burbaloni lulilolli` | Lazy cadence, beach-vibe. |
| Cocofanto Elefanto | `Cocofanto elefanto` | Stomping march. |
| Orangutini Ananasini | `Orangutini ananasini` | Up-pitched, playful. |
| Bobrito Bandito | `Bobrito bandito, bobrito bandito` | Spaghetti-western drawl. |
| _33 chars total_ | _see `characters.md`_ | For any character without an established call-sign, build one as `<name>, <name>` triple-repeat over the first 2s. |

## Hook construction patterns

Pick one per video:

1. **Cold call-sign** — frame opens on the character mid-action, VO drops in immediately: `Tralalero tralala, tralalero tralala...`. No setup, no narration. The fastest scroll-stop.
2. **Action-then-name** — character does something incongruous (smashes a watermelon, files taxes, vacuums) before the VO names them. Adds 0.5s of "what is this?" before the meme-recognition payoff.
3. **POV opener** — first-person shot looking up at the character mid-action; their call-sign drops as they turn to camera.
4. **False-genre tease** — opens like a cooking show / news report / tutorial for 1-2s, then the character ENTERS and the genre crumbles. High effort, high upside.

## What NOT to do

- ❌ Don't write English hooks. "Today I'm going to show you..." is the wrong format.
- ❌ Don't translate the call-signs. They're memetic phonemes, not Italian.
- ❌ Don't omit the call-sign — that IS the recognizable hook; without it the video looks like generic AI slop.
- ❌ Don't combine two characters' call-signs in the hook (multi-character crossovers are body-section content, not hook content).
- ❌ Don't overlay music in the hook — VO needs the open air. Music in (if at all) at 2s+.

## VO direction for the hook

ElevenLabs `eleven_multilingual_v2`, voice = Adam/Antoni/Bill/any high-energy male:
- **stability** = 0.35 (a little wobble = personality)
- **similarity_boost** = 0.75
- **style** = 0.5 (lean dramatic for militant chars, calm for ballerinas)
- **speaker_boost** = on
- **energy** = match the character: Tralalero = playful, Bombardiro = militant, Ballerina = dancey, Cappuccino = menacing whisper.

One TTS call for the full 8-25s. Don't chunk — the rhythm of the chant matters.
