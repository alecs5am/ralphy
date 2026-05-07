# Ralphy landing — Next.js 15 + Tailwind v4

A single-page landing for Ralphy, built with the **App Router**, **Tailwind v4**, and
**TypeScript**, served via Bun + Turbopack.

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
    layout.tsx       — fonts, metadata, atmospheric overlay
    page.tsx         — section composition
    globals.css      — Tailwind v4 @theme + brand tokens
  components/
    Nav.tsx
    Hero.tsx
    Capabilities.tsx
    InstallCommand.tsx
    Pipeline.tsx
    Gallery.tsx
    VideoCard.tsx
    Stack.tsx
    Community.tsx
    StarCta.tsx
    Footer.tsx
    Reveal.tsx       — IntersectionObserver fade-up
    icons.tsx
  lib/
    site.ts          — links, install command, video clip metadata
  public/
    bg/              — section background art (mascot + HUD scenes)
    posters/         — extracted poster frames for video cards
    videos -> ../../public/lyadov-podcast-001  (symlink to real generated mp4s)
```

## Where the videos come from

The gallery streams real generated videos from
`public/lyadov-podcast-001/` at the repo root. They're an AI-dubbed Russian
podcast, end-to-end produced by Ralphy. The `landing/public/videos`
**symlink** points there so we don't duplicate ~80 MB into the Next.js public folder.

If you ever rename or move that folder, update the symlink:

```bash
cd landing/public
rm videos && ln -s ../../public/<your-folder> videos
```

## Where to swap content

- Site links, install command, repo URL — `lib/site.ts`
- Gallery clips (label, title, span, ratio) — `lib/site.ts` (`clips` array)
- Brand tokens (cyan, ink, fonts) — `app/globals.css` (`@theme` block)
