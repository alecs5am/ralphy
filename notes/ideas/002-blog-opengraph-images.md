# OpenGraph images for blog articles

> **Status:** idea
> **Filed:** 2026-05-21
> **Folder:** ideas

## Context

The blog at `/blog/<slug>` currently ships zero OpenGraph metadata beyond
what Next.js generates automatically (page title via `generateMetadata`).
Pasting a link into X, LinkedIn, Discord, Slack, or any messenger that
honours OG falls back to a generic preview — site domain, raw title, no
image. That's a wasted distribution surface, especially given the article
is a marketing artifact whose whole point is being shared.

The blog page is in `landing/app/blog/[slug]/page.tsx`. Frontmatter already
carries `title`, `description`, `authors`, `category`, `date` — everything
needed to render a preview card.

## What

Generate a per-article OG image (1200×630) at build time. Two viable paths:

### Path A — `next/og` (Vercel's ImageResponse API)

Next.js ships `next/og` in App Router. You add `opengraph-image.tsx` next
to the route (or programmatic via `generateMetadata` returning
`openGraph.images`). At build time / first request, Next renders a React
component to PNG via Satori. Static, cached at the edge.

Sketch:

```tsx
// landing/app/blog/[slug]/opengraph-image.tsx
import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function og({ params }: { params: { slug: string } }) {
  const post = await readPost(params.slug);
  return new ImageResponse(
    (
      <div style={{
        background: "#0A0A0B",
        color: "#F5F5F4",
        display: "flex",
        flexDirection: "column",
        padding: "72px 64px",
        height: "100%",
        fontFamily: "AWS Diatype Mono",
      }}>
        <div style={{ color: "#E87BA1", fontSize: 22, letterSpacing: 4 }}>
          {(post?.frontmatter.category ?? "BLOG").toUpperCase()}
        </div>
        <div style={{ fontSize: 78, lineHeight: 1.04, marginTop: 28 }}>
          {post?.frontmatter.title}
        </div>
        <div style={{ marginTop: "auto", display: "flex", gap: 18, fontSize: 22 }}>
          <span>RALPHY · blog</span>
          <span style={{ color: "#8E8E8B" }}>
            {(post?.frontmatter.authors ?? []).join(" · ")}
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
```

- ✅ Zero deps (already in Next).
- ✅ Server-rendered, cached.
- ✅ Fonts can be loaded from `landing/public/assets/fonts/`.
- ⚠️ Satori has CSS subset limitations — no `clamp()`, limited flex
  semantics, custom fonts need to be loaded as ArrayBuffer.

### Path B — Pre-generated PNGs via Playwright / Puppeteer

Run a script at build time that opens the blog post in a headless browser
at 1200×630, screenshots the `<header>` + maybe the first paragraph, saves
to `landing/public/og/<slug>.png`, then references that in metadata.

- ✅ Pixel-perfect with site CSS — no Satori limitations.
- ⚠️ Heavier build step, needs Chromium in CI.
- ⚠️ Has to re-run when CSS or article changes.

**Recommendation:** start with Path A (`next/og`). It's idiomatic for
App Router, ships with the framework, and the design here (heading +
category chip + author byline) fits comfortably in Satori's subset.

## Metadata wiring

In `landing/app/blog/[slug]/page.tsx → generateMetadata`, return:

```ts
return {
  title: `${post.frontmatter.title} · Ralphy`,
  description: post.frontmatter.description,
  openGraph: {
    title: post.frontmatter.title,
    description: post.frontmatter.description,
    type: "article",
    publishedTime: post.frontmatter.date,
    authors: post.frontmatter.authors,
    images: [`/blog/${slug}/opengraph-image`],
  },
  twitter: {
    card: "summary_large_image",
    title: post.frontmatter.title,
    description: post.frontmatter.description,
    images: [`/blog/${slug}/opengraph-image`],
  },
};
```

The `opengraph-image.tsx` route is automatically picked up by Next and
serves the rendered PNG at the path above.

## Design direction

Keep the OG cards aligned with the blog masthead:

- Black `#0A0A0B` background, the same dot-grid texture if Satori can
  render it via SVG-as-data-URL (otherwise drop it).
- Category chip top-left in `--vio` (`#E87BA1`).
- Title in AWS Diatype Mono Bold uppercase, 72-82pt, max 4 lines, balanced.
- Bottom row: `RALPHY · blog` + author byline (`alecs5am`) + date.
- Optional: small avatar disc next to author name (load from
  `github.com/<handle>.png?size=96` at build).

## Done-when

1. `landing/app/blog/[slug]/opengraph-image.tsx` exists and renders
   per-article PNG at build time.
2. `generateMetadata` populates `openGraph` + `twitter` for each post.
3. Paste `https://ralphy.dev/blog/ralphy-vs-higgsfield` into X — preview
   card shows the custom image with title + category + author.
4. Validate via the X Card Validator and the LinkedIn Post Inspector.
5. Also wire the landing index (`/`) to a sitewide OG with the Ralphy
   wordmark, if it doesn't already have one.

## Adjacent

The landing root page may already ship an OG image. Verify before adding
the blog ones — we want the blog-specific ones to be additive, not to
overwrite a working sitewide preview.
