# Ralphy branding

Canonical brand assets shared across landing, Mintlify docs, CLI, and README.

## Source of truth

| Surface | File | Notes |
|---|---|---|
| Palette + fonts + voice | [`tokens.json`](tokens.json) | Machine-readable token set. Imported by landing, mirrored in `docs-mintlify/docs.json`, and referenced by `cli/lib/ui.ts`. |
| README banner | [`banner.png`](banner.png) | Hand-designed (per [07-D-04](../../roadmap/07-socials-and-docs/OPEN-QUESTIONS.md#decision-log)). No Ralphy-generated replacement for v1.0. |
| Logo (Mintlify + landing) | [`../../docs-mintlify/logo.svg`](../../docs-mintlify/logo.svg) | Single source — symlink or copy to landing if needed. |
| Favicon (Mintlify) | [`../../docs-mintlify/favicon.svg`](../../docs-mintlify/favicon.svg) | SVG primary, PNG fallback at `favicon.png`. |

## Palette

| Token | Hex | Use |
|---|---|---|
| `colors.primary` | `#FF7A1A` | Ralphy orange. CTAs, links, brand fill, Mintlify primary, CLI `c.brand`. |
| `colors.accent` | `#E87BA1` | Terminal pink. Selection highlight, landing `--vio`, CLI `c.accent`. |
| `colors.background` | `#0A0A0B` | Stage black. Default background landing + Mintlify (both light and dark mode → identical). |
| `colors.ink` | `#F5F5F4` | Foreground text. |
| `colors.muted` | `#8E8E8B` | Secondary text, dim labels. |

## Fonts

- **Heading:** AWS Diatype Mono (700) — `docs-mintlify/fonts/AWSDiatypeRoundedSemi-Mono-Bold.woff2`
- **Body:** AWS Diatype (400) — `docs-mintlify/fonts/AWSDiatype-Regular.woff2`
- **Code:** Fragment Mono (400) — `docs-mintlify/fonts/FragmentMono-Regular.woff2`

## Voice

> An autonomous UGC-video studio in one repo. Drive it from a chat. Get an mp4 in ~8 minutes.

Canonical lowercase command name is `ralphy`. Display name in prose: `Ralphy`. Never SHOUT or `RALPHY` outside the README banner art.

## Audit invariants (07.06.03)

Before each release, verify:

1. Mintlify `docs.json` `colors.primary` / `colors.light` / `colors.dark` match `tokens.json`.
2. Landing `--bg`, `--ink`, `--vio` CSS variables match the token values.
3. README banner is the latest committed `banner.png` and the alt text uses the canonical "RALPHY — UGC video pipeline CLI".
4. CLI `c.brand` / `c.accent` in `cli/lib/ui.ts` match the token hex codes.

A future task (07.10.x — post-launch) wires a small `bun run lint:brand` script that diffs the surfaces against `tokens.json`. v1.0 ships with the manual audit.
