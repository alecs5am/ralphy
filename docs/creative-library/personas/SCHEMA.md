# Persona schema

The extended persona schema after Sprint 2.1. Old personas (created
with a minimal set: `name`, `language`, `voice`, `tone`, `demographics`)
remain compatible — the new fields are optional.

## Top-level

```jsonc
{
  "id": "aleks-it-27",
  "name": "Aleks IT 27",
  "language": "ru",
  "archetype": "it-remote",        // ← NEW. Key from ARCHETYPES.md or null

  "voice": {                       // existing
    "provider": "elevenlabs",
    "model": "eleven_multilingual_v2",
    "voiceId": "21m00Tcm4TlvDq8ikWAM",
    "stability": 0.55,
    "similarityBoost": 0.8
  },

  "tone": "deadpan, ironic",       // existing — short text
  "demographics": {                // existing
    "ageRange": "26-34",
    "gender": "M"
  },

  "appearance": {                  // ← NEW
    "style": "oversized t-shirt, dark colors",
    "hair": "medium dark, slight stubble",
    "vibe": "tired-cool, unbothered"
  },

  "personality": {                 // ← NEW
    "energy": "low-medium, deadpan",
    "speakingStyle": "short sentences, technical jargon without explanation",
    "credibility": "5+ years dev experience, ships things"
  },

  "context": {                     // ← NEW
    "typicalSetting": "home office with mechanical keyboard, dim warm light",
    "wardrobe": "black hoodie, simple t-shirt, no logos",
    "props": "MacBook, AirPods, mechanical keyboard, mug"
  },

  "createdAt": "2026-04-30T...",
  "updatedAt": "2026-04-30T..."
}
```

## CLI flags (`persona create` / `persona update`)

| Flag | Maps to | Notes |
|---|---|---|
| `--name` | `name` | required |
| `--language` | `language` | default `en` |
| `--archetype` | `archetype` | one of: `student-grind`, `it-remote`, `courier-driver`, `mom-blogger`, `gen-z-energy`, `startup-founder`, `marketer-perf`, `wfh-worker` |
| `--voice` | `voice` | format `provider:model/voiceId` or just a string |
| `--stability` | `voice.stability` | 0-1 |
| `--similarity` | `voice.similarityBoost` | 0-1 |
| `--tone` | `tone` | short description |
| `--age` | `demographics.ageRange` | `26-34` |
| `--gender` | `demographics.gender` | `M` / `F` / `nb` |
| `--style` | `appearance.style` | outward style |
| `--hair` | `appearance.hair` | hair |
| `--vibe` | `appearance.vibe` | overall vibe |
| `--energy` | `personality.energy` | tempo/volume |
| `--speaking-style` | `personality.speakingStyle` | how they speak |
| `--credibility` | `personality.credibility` | why they're believed |
| `--setting` | `context.typicalSetting` | where we shoot |
| `--wardrobe` | `context.wardrobe` | clothing |
| `--props` | `context.props` | items in frame |

## Reading

```bash
bun run ralph -- persona show <id>           # full JSON
bun run ralph -- persona show <id> -p        # pretty
bun run ralph -- persona list                # all, short column
```

## Storage

- Registry: `.ralphy/registry.json` (under the `personas` key)
- Individual file: `.ralphy/workspaces/<ws>/shared/personas/<id>.json`
  (dual-write via `cli/lib/registry.ts`)

## Backward compatibility

Old personas without `archetype` / `appearance` / `personality` / `context`
remain valid. The fields are optional. The `list` / `show` commands work
without changes.
