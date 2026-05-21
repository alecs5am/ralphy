/* Dynamic OG card for /blog/<slug>.
 *
 * Next.js App Router convention: a file named opengraph-image.tsx next
 * to the page route is auto-registered as that route's og:image (and
 * the same image is reused for twitter:image when summary_large_image
 * is requested by generateMetadata).
 *
 * Layout matches the Pencil design hand-off (Solid amber CTA card):
 *
 *   ┌───────────────────────────────────────────────────────┐
 *   │ [icon] RALPHY                FIELD NOTES · MMM DD     │
 *   │                                                       │
 *   │   ARTICLE                          ╔═══╗              │
 *   │   TITLE                            ║   ║   ← mascot   │
 *   │   GOES                             ╚═══╝              │
 *   │   HERE                                                │
 *   │                                                       │
 *   │   ⊙ Author Name                                       │
 *   │     Founder, Ralphy                                   │
 *   └───────────────────────────────────────────────────────┘
 *
 * The amber field + black mascot silhouette is a pre-rendered PNG
 * (`landing/public/og/blog-bg.png`, extracted from the design HTML).
 * Everything overlaid on top is dynamic, pulled from the article's
 * frontmatter.
 */

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  type Author,
  formatDate,
  readPost,
  resolveAuthors,
} from "@/lib/blog";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* Need node runtime for fs reads (fonts + bg PNG). Satori works on both
 * edge and node; we pick node for the simpler font loading path. */
export const runtime = "nodejs";

const PUBLIC = join(process.cwd(), "public");

async function loadFonts() {
  /* Satori (under next/og) only accepts raw OpenType / TTF — it rejects
   * woff2 with "Unsupported OpenType signature wOF2". We ship TTF copies
   * alongside the woff2 fonts used by the live site, decompressed once
   * via `fonttools ttLib.woff2 decompress` (see public/assets/fonts-og/). */
  const [diatypeMonoBold, diatypeRegular, fragmentMono] = await Promise.all([
    readFile(join(PUBLIC, "assets/fonts-og/AWSDiatypeRoundedSemi-Mono-Bold.ttf")),
    readFile(join(PUBLIC, "assets/fonts-og/AWSDiatype-Regular.ttf")),
    readFile(join(PUBLIC, "assets/fonts-og/FragmentMono-Regular.ttf")),
  ]);
  return [
    { name: "Diatype Mono", data: diatypeMonoBold, style: "normal" as const, weight: 700 as const },
    { name: "Diatype Sans", data: diatypeRegular, style: "normal" as const, weight: 400 as const },
    { name: "Fragment Mono", data: fragmentMono, style: "normal" as const, weight: 400 as const },
  ];
}

async function loadBgDataUri() {
  /* Use the @2x asset for sharpness — Satori downscales to fit the
   * 1200×630 canvas; starting from 2400×1260 keeps the edges crisp on
   * platforms that re-encode at 2x density (Twitter, LinkedIn). */
  const bytes = await readFile(join(PUBLIC, "og/blog-bg@2x.png"));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

/* Fetch the GitHub avatar server-side and inline it as a data URI so
 * Satori can rasterise it without making a network call mid-render.
 * Returns null on any failure — the caller renders initials instead. */
async function loadAvatar(handle: string | undefined): Promise<string | null> {
  if (!handle) return null;
  try {
    const res = await fetch(`https://github.com/${handle}.png?size=200`, {
      // Cache at the platform edge for an hour. Avatars change rarely;
      // a longer TTL would just delay author photo updates after a swap.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") ?? "image/png";
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/* OG date format mirrors the design: "FIELD NOTES · MAY 21, 2026" */
function formatOgDate(iso: string | undefined): string {
  const human = formatDate(iso);
  return human ? human.toUpperCase() : "";
}

export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await readPost(slug);

  const title =
    post?.frontmatter.title ??
    "Ralphy — open-source UGC pipeline for AI-native teams";
  const category = (post?.frontmatter.category ?? "Field notes").toUpperCase();
  const dateStr = formatOgDate(post?.frontmatter.date);
  const author: Author | undefined = post
    ? resolveAuthors(post.frontmatter)[0]
    : undefined;

  const [fonts, bgUri, avatarUri] = await Promise.all([
    loadFonts(),
    loadBgDataUri(),
    loadAvatar(author?.handle),
  ]);

  /* Title sizing: long titles auto-shrink so they wrap to more lines
   * inside the 640px left column instead of bleeding into the mascot
   * silhouette on the right. Breakpoints tuned against the longest
   * Higgsfield-comparison title (73 chars) and the design preview's
   * Lede-style headings. */
  const titleLen = title.length;
  const titleFontSize =
    titleLen > 80 ? 42 :
    titleLen > 60 ? 50 :
    titleLen > 40 ? 60 :
    titleLen > 25 ? 72 : 84;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          background: "#FFA630",
          position: "relative",
          fontFamily: "Diatype Sans",
        }}
      >
        {/* Background plate — amber field + mascot silhouette, baked PNG */}
        <img
          src={bgUri}
          width={1200}
          height={630}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
          }}
        />

        {/* Header row: brand mark on the left, category + date on the right */}
        <div
          style={{
            position: "absolute",
            top: 48,
            left: 56,
            right: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <RalphyMark size={32} fill="#0A0A0B" />
            <div
              style={{
                fontFamily: "Diatype Mono",
                fontWeight: 700,
                fontSize: 24,
                color: "#0A0A0B",
                letterSpacing: -0.5,
              }}
            >
              RALPHY
            </div>
          </div>
          <div
            style={{
              fontFamily: "Fragment Mono",
              fontSize: 13,
              color: "#0A0A0B",
              letterSpacing: 2,
              display: "flex",
            }}
          >
            {`${category}${dateStr ? ` · ${dateStr}` : ""}`}
          </div>
        </div>

        {/* Title — left-aligned, capped at 640px so wrapping happens
            inside the quiet left column before the mascot silhouette
            starts (mascot enters around x=700). */}
        <div
          style={{
            position: "absolute",
            top: 150,
            left: 56,
            width: 640,
            display: "flex",
          }}
        >
          <div
            style={{
              fontFamily: "Diatype Mono",
              fontWeight: 700,
              fontSize: titleFontSize,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              color: "#0A0A0B",
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            {title}
          </div>
        </div>

        {/* Author plate — bottom-left */}
        {author && (
          <div
            style={{
              position: "absolute",
              bottom: 56,
              left: 56,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 56,
                background: "#0A0A0B",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {avatarUri ? (
                /* Satori doesn't clip child images via the parent's
                   overflow+borderRadius, so we set borderRadius on the
                   img itself. objectFit:cover handles non-square
                   sources. */
                <img
                  src={avatarUri}
                  width={56}
                  height={56}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 56,
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  style={{
                    color: "#FFA630",
                    fontFamily: "Diatype Mono",
                    fontWeight: 700,
                    fontSize: 22,
                    letterSpacing: -0.5,
                    display: "flex",
                  }}
                >
                  {initialsOf(author.name)}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div
                style={{
                  fontFamily: "Diatype Sans",
                  fontWeight: 400,
                  fontSize: 20,
                  color: "#0A0A0B",
                  letterSpacing: -0.2,
                  display: "flex",
                }}
              >
                {author.name}
              </div>
              {/* Sub-label: explicit role from frontmatter > GitHub
                  @handle > nothing. The article byline shows just the
                  handle on its own row, so mirror that here. */}
              {(author.role || (author.handle && author.handle !== author.name)) && (
                <div
                  style={{
                    fontFamily: "Fragment Mono",
                    fontSize: 13,
                    color: "#C97A1C",
                    letterSpacing: 0.5,
                    display: "flex",
                  }}
                >
                  {author.role ?? `@${author.handle}`}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    ),
    { ...size, fonts },
  );
}

/* Inline 32px Ralphy mascot mark for the top-left brand lockup.
 * Same shape as landing/app/icon.svg, but flattened so Satori can render
 * it without SVG-mask support: ghost body + hat as a solid path, then
 * two amber ellipses (matching the card bg) painted on top to "cut out"
 * the eye holes. */
function RalphyMark({ size, fill }: { size: number; fill: string }) {
  const eyeFill = "#FFA630";
  return (
    <svg
      width={size}
      height={size}
      viewBox="185 223 1591 1591"
      style={{ display: "block" }}
    >
      <path
        transform="translate(365,473)"
        d="m0 0h13l14 2 18 5 21 10 18 11 14 10 18 14 14 12 11 10 11 9 9 8 10 8 13 11 17 13 16 13 17 12 17 11 24 14 18 10 17 9 34 15 24 9 36 12 22 6 48 10 36 6 24 3 42 3 35 1h24l36-2 44-5 41-7 33-7 28-8 31-11 32-12 27-12 25-12 19-9 16-8 23-12 16-9 22-11 36-19 34-15 26-10 23-7 23-5 16-2h26l21 4 15 5 23 12 11 9 7 6 11 14 9 16 5 12 4 13 3 19v26l-4 22-6 21-9 20-8 16-9 13-8 11-8 10-7 9h-2l-2 4-16 16-11 9-10 9-18 13-15 9-23 12-21 10-27 9-13 4-10 7-3 4 1 8 14 31 7 15 10 25 13 37 9 30 9 35 10 52 5 34 3 30 3 40 3 58 4 32 6 29 7 24 9 26 14 44 6 25 3 20 2 30-1 24-3 20-5 19-8 20-10 19-12 17-11 13-7 7-14 11-13 9-16 9-19 8-15 5-24 5-27 3h-34l-35-4-27-5-23-5-7-1h-27l-17 3-17 6-15 8-26 17-29 17-21 11-31 13-28 10-31 8-35 6-37 4-17 1h-38l-27-2-41-6-27-6-40-12-22-9-34-16-24-14-21-13-10-7-17-10-16-6-15-3h-27l-31 5-27 5-32 4-13 1h-28l-30-4-23-5-24-8-19-9-15-10-14-11-9-8-9-11-13-18-9-15-7-16-5-15-6-29-2-16v-24l5-35 6-26 12-36 9-25 12-36 6-25 6-42 6-83 4-38 8-50 6-28 10-40 10-33 12-36 9-24 15-33 11-23 11-20 6-12 13-23 16-24 14-19 26-32 9-10 4-2 42 12 41 12 40 10 53 12 50 9 35 5 45 5 46 4 22 1h52l33-2 49-4 43-5 50-8 82-15 27-4 29-2h17l32 2 23 4 19 6 15 6 19 10 12 9 16 16 7 8 9 7 6 2 7-1 6-4 6-10 1-2-1-10-10-16-11-12-15-15-17-12-22-12-28-11-21-5-28-4-10-1h-45l-39 4-45 7-67 11-50 7-42 4-49 3h-70l-31-2-52-6-41-5-41-7-41-9-56-13-31-8-37-11-25-6-39-8-11-1h-15l-11 2-9 6-6 12v9l8 11 4 2 29 2-2 4-10 10-9 11-11 14-5-2-20-11-30-20-16-13-14-11-12-11-8-8-7-8-10-10-10-13-12-18-9-15-8-16-8-24-5-20-1-10v-13l3-21 6-21 8-16 8-11 9-10 14-11 16-8 17-4z"
        fill={fill}
      />
      <path
        transform="translate(858,223)"
        d="m0 0h27l15 3 19 7 17 9 14 10 14 12 14 11 16 9 16 6 9 2 19 1 16-2 24-8 24-10 36-12 25-5h30l19 4 15 5 16 8 14 10 12 11 9 10 11 15 9 15 9 17 13 35 7 19 7 26 10 41 13 68 4 26v5l-26 11-26 10-24 7-24 6-27 5-39 5-57 5-33 2h-87l-68-4-39-4-28-4-61-10-74-15-64-16-68-19 2-6 11-27 15-38 8-17 10-19 8-18 12-22 8-16 10-19 14-23 10-15 10-14 10-13 11-14 11-12 13-13 8-7 14-11 21-12 14-6z"
        fill={fill}
      />
      {/* Eye cutouts — painted in bg color on top of the body */}
      <ellipse cx="900" cy="1055" rx="40" ry="80" fill={eyeFill} />
      <ellipse cx="690" cy="1050" rx="40" ry="80" fill={eyeFill} />
    </svg>
  );
}
