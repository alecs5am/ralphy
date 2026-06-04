// Library v2 — Screen 3 Recipe branch (#084). Specializes a `kind:"recipe"`
// block from the schematic placeholder into a described + copyable + demoable
// artifact page. Server Component (MDXRemote/rsc renders the body server-side);
// the only interactive piece is the CopyArtifact island.
//
// Each sub-section renders ONLY when its data exists, so a recipe with no
// enriched content yet (the default until #083 backfills) degrades to nothing —
// the page stays clean, never a broken frame/player. The three sub-sections:
//
//   1. What it is        — `body` markdown (MDXRemote, same stack as the blog/
//                          guideline pages: remark-gfm + rehype-highlight).
//   2. How to use it      — `artifact` in a copyable mono <pre>, labelled by
//                          `recipeKind`; `params` as a small table when present.
//   3. Live demo          — `demo.kind:"hyperframes"` → a sandboxed, LIVE-RUNNABLE
//                          <iframe> of the HF snippet (srcDoc when inline, else
//                          src) at 9:16; `demo.kind:"media"` → before/after (or
//                          single) <video>/<img>. No demo → nothing.
//
// No visible borders: separation via bg-tint steps + shadow + spacing only.

import type { Block, BlockRecipeDemo } from "@/lib/library-v2/types";
import { recipeKindLabel } from "../../../_shared/blockMeta";
import { Media } from "../../../_shared/Media";
import { CopyArtifact } from "./CopyArtifact";

export function RecipeDetail({ block }: { block: Block }) {
  const hasBody = !!block.body && block.body.trim().length > 0;
  const hasArtifact = !!block.artifact && block.artifact.trim().length > 0;
  const hasParams = !!block.params && Object.keys(block.params).length > 0;
  const demo = block.demo;
  const hasDemo = !!demo && demoHasContent(demo);

  // Nothing enriched yet — render nothing (the schematic header proof + the
  // "units that use this" feed below still carry the page).
  if (!hasBody && !hasArtifact && !hasParams && !hasDemo) return null;

  return (
    <section className="sec rx-section">
      <div className="container container-w-1760">
        <div className="rx-panel">
          {/* 1 — What it is */}
          {hasBody && (
            <div className="rx-axis">
              <p className="rx-axis-label">What it is</p>
              {/* Plain whitespace-preserving render — recipe bodies are authored
                  how-to text and must NOT go through the MDX/JSX compiler, which
                  throws on arbitrary `{`/`<` in ffmpeg/prompt prose (#083). */}
              <div className="rx-body">{block.body}</div>
            </div>
          )}

          {/* 2 — How to use it standalone */}
          {(hasArtifact || hasParams) && (
            <div className="rx-axis">
              <p className="rx-axis-label">How to use it standalone</p>
              {hasArtifact && (
                <CopyArtifact artifact={block.artifact!} label={recipeKindLabel(block.recipeKind)} />
              )}
              {hasParams && (
                <div className="bp-table-wrap rx-params">
                  <table className="bp-table">
                    <thead>
                      <tr>
                        <th>Param</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(block.params!).map(([k, v]) => (
                        <tr key={k}>
                          <td className="bp-mono">{k}</td>
                          <td className="bp-mono">
                            {typeof v === "string" ? v : JSON.stringify(v)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 3 — Live demo */}
          {hasDemo && (
            <div className="rx-axis">
              <p className="rx-axis-label">Live demo</p>
              <RecipeDemo demo={demo!} name={block.name} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function demoHasContent(demo: BlockRecipeDemo): boolean {
  if (demo.kind === "hyperframes") {
    return !!(demo.html && demo.html.trim().length > 0) || !!demo.storageUrl;
  }
  // media
  return !!(demo.beforeUrl || demo.afterUrl || demo.storageUrl);
}

function RecipeDemo({ demo, name }: { demo: BlockRecipeDemo; name: string }) {
  if (demo.kind === "hyperframes") {
    const inline = demo.html && demo.html.trim().length > 0;
    // Sandboxed, live-runnable embed of the HF snippet. The HF runtime is
    // HTML + GSAP + JS, so `allow-scripts` is required to let it animate.
    // We deliberately do NOT grant `allow-same-origin` — the snippet needs no
    // access to this origin's storage/DOM, and withholding it keeps the embed
    // a true sandbox. 9:16 to match the unit/video aspect.
    return (
      <div className="rx-demo-frame" style={{ aspectRatio: "9 / 16" }}>
        <iframe
          title={`${name} — live demo`}
          className="rx-iframe"
          sandbox="allow-scripts"
          loading="lazy"
          {...(inline ? { srcDoc: demo.html! } : { src: demo.storageUrl! })}
        />
      </div>
    );
  }

  // media — before/after (or single). Decide image vs video by extension; the
  // native controls need no JS.
  const before = demo.beforeUrl;
  const after = demo.afterUrl ?? demo.storageUrl;
  const both = !!before && !!after;

  if (both) {
    return (
      <div className="ba-pair rx-ba">
        <DemoMedia url={before!} poster={demo.posterUrl} tag="before" />
        <DemoMedia url={after!} poster={demo.posterUrl} tag={`after · ${name}`} />
      </div>
    );
  }

  const single = after ?? before;
  if (!single) return null;
  return (
    <div className="rx-demo-single">
      <DemoMedia url={single} poster={demo.posterUrl} />
    </div>
  );
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

function DemoMedia({ url, poster, tag }: { url: string; poster?: string; tag?: string }) {
  const isVideo = VIDEO_EXT.test(url);
  // Route through <Media> (#088): contain + cinema bars into a 16/9 demo box +
  // click-to-lightbox. Folds in the old `.rx-media { width:100%; height:auto }`
  // native-dimension rendering. The `.tag` overlay (before/after label) stays.
  return (
    <div className="rx-bap">
      {tag && <span className="tag">{tag}</span>}
      <Media
        src={url}
        kind={isVideo ? "video" : "image"}
        alt={tag ?? "recipe demo"}
        poster={poster}
        displayAspect="16 / 9"
        controls={isVideo}
      />
    </div>
  );
}
