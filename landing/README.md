# Ralphy landing — Next.js 15 + TypeScript

A single-page landing for Ralphy, built with the **App Router**, **TypeScript**, and plain CSS, served via Bun + Turbopack.

## Local dev

```bash
cd landing
bun install
bun run dev          # http://localhost:4173
```

Production build:

```bash
bun run build
bun run start
```

## Layout

```
landing/
  app/
    layout.tsx       — metadata, brand-icon preloads, root accent var
    page.tsx         — section composition
    globals.css      — @font-face + design tokens + all styles
  components/
    Nav.tsx          — top navigation
    Footer.tsx
    StickyBar.tsx    — scroll-anchored install CTA
    Hero.tsx         — cycling-brand headline + (CLI/MCP/Skill × agent) installer
    VideoTile.tsx    — mosaic cell with hover-preview video
    Lightbox.tsx     — fullscreen video viewer
    BrandLockup.tsx  — inline icon + wordmark pair
    Mascot.tsx       — pixel-art glyph (blinks)
    MascotSVG.tsx    — full vector mascot used in CTA + logo glyph
    Icons.tsx        — flat 1.5px-stroke icon set + brand monograms
    Highlighter.tsx  — rough-notation underline/highlight wrapper
    SectionPrimitives.tsx — SectionHead · TerminalBlock · Duo
    sections/
      HowItWorks.tsx
      Showcase.tsx
      Templates.tsx
      Pipeline.tsx
      Stack.tsx
      Community.tsx
      StarCta.tsx
  lib/
    data.tsx         — copy, nav items, gallery clips, stack chips, channels
  public/
    assets/
      brands/        — brand icon+wordmark SVGs
      fonts/         — AWS Diatype + Fragment Mono woff2
      posters/       — gallery video poster frames
      videos/        — gallery mp4s (metal-XX, soviet-XX)
      ralphy-mascot.svg
```

## Where to swap content

- Site links, install command, repo URL — `lib/data.tsx` (`site`)
- Gallery clips (label, title, span, ratio) — `lib/data.tsx` (`clips`)
- Accent color (used by `--vio` CSS var) — `app/layout.tsx` (`style={{ "--vio": ... }}`)
- Brand tokens, font faces — `app/globals.css`
