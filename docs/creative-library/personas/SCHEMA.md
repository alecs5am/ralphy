# Persona schema

Расширенная схема персоны после Sprint 2.1. Старые персоны (создавались
с минимальным набором: `name`, `language`, `voice`, `tone`, `demographics`)
остаются совместимыми — новые поля опциональны.

## Top-level

```jsonc
{
  "id": "aleks-it-27",
  "name": "Aleks IT 27",
  "language": "ru",
  "archetype": "it-remote",        // ← NEW. Ключ из ARCHETYPES.md или null

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
| `--voice` | `voice` | формат `provider:model/voiceId` или просто строка |
| `--stability` | `voice.stability` | 0-1 |
| `--similarity` | `voice.similarityBoost` | 0-1 |
| `--tone` | `tone` | короткое описание |
| `--age` | `demographics.ageRange` | `26-34` |
| `--gender` | `demographics.gender` | `M` / `F` / `nb` |
| `--style` | `appearance.style` | внешний стиль |
| `--hair` | `appearance.hair` | волосы |
| `--vibe` | `appearance.vibe` | общий vibe |
| `--energy` | `personality.energy` | темп/громкость |
| `--speaking-style` | `personality.speakingStyle` | как говорит |
| `--credibility` | `personality.credibility` | почему ему верят |
| `--setting` | `context.typicalSetting` | где снимаем |
| `--wardrobe` | `context.wardrobe` | одежда |
| `--props` | `context.props` | вещи в кадре |

## Reading

```bash
bun run ralph -- persona show <id>           # full JSON
bun run ralph -- persona show <id> -p        # pretty
bun run ralph -- persona list                # все, краткая колонка
```

## Storage

- Registry: `workspace/.ralph/registry.json` (под ключом `personas`)
- Individual file: `workspace/.ralph/personas/<id>.json`
  (dual-write через `cli/lib/registry.ts`)

## Backward compatibility

Старые персоны без `archetype` / `appearance` / `personality` / `context`
остаются валидными. Поля опциональны. Команды `list` / `show` работают
без изменений.
