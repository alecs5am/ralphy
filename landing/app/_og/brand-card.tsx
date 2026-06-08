/* Shared branded OG card renderer — used by app/opengraph-image.tsx (site
 * default) and app/library/opengraph-image.tsx. The /blog route keeps its own
 * richer author-card renderer; this is the generic "amber field + wordmark +
 * eyebrow + title + url" lockup for every other surface.
 *
 * The leading `_` on this folder opts it out of Next routing, so this file is
 * a plain shared module, not a route.
 *
 *   ┌───────────────────────────────────────────────────────┐
 *   │ [icon] RALPHY                                          │
 *   │                                                       │
 *   │   EYEBROW · MONO                                       │
 *   │   BIG TITLE                                            │
 *   │   GOES HERE                                            │
 *   │                                                       │
 *   │   www.alecs5am.com                                    │
 *   └───────────────────────────────────────────────────────┘
 *
 * Fonts are reused (inlined base64) from the blog OG assets so this route
 * ships self-contained on Vercel — the fs-based asset loaders silently fail
 * in the serverless function bundle, which is why everything is base64.
 */

import { ImageResponse } from "next/og";
import {
  DIATYPE_MONO_BOLD_B64,
  DIATYPE_REGULAR_B64,
  FRAGMENT_MONO_B64,
} from "@/app/blog/[slug]/og-assets-inline";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const AMBER = "#FFA630";
const INK = "#0A0A0B";

function decode(b64: string): Buffer {
  return Buffer.from(b64, "base64");
}

function fonts() {
  return [
    {
      name: "Diatype Mono",
      data: decode(DIATYPE_MONO_BOLD_B64),
      style: "normal" as const,
      weight: 700 as const,
    },
    {
      name: "Diatype Sans",
      data: decode(DIATYPE_REGULAR_B64),
      style: "normal" as const,
      weight: 400 as const,
    },
    {
      name: "Fragment Mono",
      data: decode(FRAGMENT_MONO_B64),
      style: "normal" as const,
      weight: 400 as const,
    },
  ];
}

export function renderBrandOg({
  eyebrow,
  title,
  url = "www.alecs5am.com",
}: {
  eyebrow: string;
  title: string;
  url?: string;
}) {
  // Title sizing: shrink long titles so they wrap inside the card instead of
  // bleeding past the mascot on the right.
  const len = title.length;
  const titleFontSize =
    len > 64 ? 64 : len > 44 ? 76 : len > 26 ? 92 : 108;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          background: AMBER,
          position: "relative",
          fontFamily: "Diatype Sans",
          padding: "56px",
        }}
      >
        {/* Oversized mascot watermark, bottom-right, bled off-canvas */}
        <div
          style={{
            position: "absolute",
            right: -120,
            bottom: -160,
            display: "flex",
            opacity: 0.16,
          }}
        >
          <RalphyMark size={720} fill={INK} bg={AMBER} />
        </div>

        {/* Brand lockup, top-left */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <RalphyMark size={40} fill={INK} bg={AMBER} />
          <div
            style={{
              fontFamily: "Diatype Mono",
              fontWeight: 700,
              fontSize: 30,
              color: INK,
              letterSpacing: -0.5,
            }}
          >
            RALPHY
          </div>
        </div>

        {/* Eyebrow + title block, vertically centered in the remaining space */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            maxWidth: 880,
          }}
        >
          <div
            style={{
              fontFamily: "Fragment Mono",
              fontSize: 22,
              color: INK,
              letterSpacing: 4,
              textTransform: "uppercase",
              display: "flex",
              marginBottom: 20,
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              fontFamily: "Diatype Mono",
              fontWeight: 700,
              fontSize: titleFontSize,
              lineHeight: 1.02,
              letterSpacing: -2,
              color: INK,
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            {title}
          </div>
        </div>

        {/* Footer url */}
        <div
          style={{
            fontFamily: "Fragment Mono",
            fontSize: 22,
            color: INK,
            letterSpacing: 1,
            display: "flex",
          }}
        >
          {url}
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: fonts() },
  );
}

/* Flattened Ralphy mascot mark — ghost body + hat as a solid path, with two
 * bg-color ellipses painted on top to cut out the eye holes (Satori has no
 * SVG-mask support). Mirrors landing/app/icon.svg. */
function RalphyMark({
  size,
  fill,
  bg,
}: {
  size: number;
  fill: string;
  bg: string;
}) {
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
      <ellipse cx="900" cy="1055" rx="40" ry="80" fill={bg} />
      <ellipse cx="690" cy="1050" rx="40" ry="80" fill={bg} />
    </svg>
  );
}
