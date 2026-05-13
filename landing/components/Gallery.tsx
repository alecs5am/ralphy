import { Block, Inline, Chip } from "./Block";
import { VideoCard } from "./VideoCard";
import { clips, site, videoStyles } from "@/lib/site";
import { SparkMark, BoltMark, CheckMark } from "./icons";

/* ──────────────────────────────────────────────
   /06 — Templates first, sample renders second.

   The new positioning leads with the template
   library (5 style families operators can fork
   in one command). The vertical clips below are
   sample renders from the existing showcase
   profile — proof the pipeline actually outputs.
   ────────────────────────────────────────────── */

export function Gallery() {
  return (
    <section id="gallery" className="relative">
      <div className="mx-auto max-w-[1280px] px-7">
        <Block
          n="06"
          title={
            <>
              A growing template library.
              <br />
              <em>Fork, restyle, ship.</em>
            </>
          }
          lede={
            <>
              Five style families today, more landing each week. Every entry is
              a fork-and-tweak starter — drop your product, restyle, render in
              one command. No timeline editor, no asset bundle to chase down.
            </>
          }
        >
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <Chip icon={<SparkMark />} label="open MIT templates" />
            <Chip icon={<BoltMark />} label="rebrand-friendly" />
            <Chip icon={<CheckMark />} label="one command to fork" />
            <Chip muted label="more landing weekly" />
          </div>

          <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-2 lg:grid-cols-5">
            {videoStyles.map((s) => (
              <li
                key={s.id}
                className="relative flex h-full flex-col gap-3 bg-[rgb(6_9_15/0.78)] p-5 backdrop-blur-md"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-[12px] uppercase tracking-[0.06em] text-[var(--color-cyan)]"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    {s.kicker}
                  </span>
                  <span
                    className={[
                      "rounded-[4px] px-1.5 py-[1px] text-[10.5px] uppercase tracking-[0.06em]",
                      s.status === "live"
                        ? "bg-[rgb(61_216_255/0.14)] text-[var(--color-cyan-2)]"
                        : "border border-[var(--color-line)] text-[var(--color-mute)]",
                    ].join(" ")}
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    {s.status === "live" ? "live" : "soon"}
                  </span>
                </div>
                <div
                  className="text-[22px] italic leading-[1.05] text-[var(--color-frost)]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {s.title}
                </div>
                <div className="text-[13px] leading-[1.55] text-[var(--color-mute)]">
                  {s.copy}
                </div>
              </li>
            ))}
          </ol>

          {/* Sample renders — proof of life from the showcase profile */}
          <div className="mt-10 mb-4 flex flex-wrap items-center justify-between gap-3">
            <p
              className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              ··  sample renders · profile · ralphy-showcase
            </p>
            <a
              href={`${site.repo}/tree/main/profiles/ralphy-showcase`}
              target="_blank"
              rel="noopener"
              className="text-[12.5px] text-[var(--color-cyan)] underline-offset-4 hover:underline"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              See the profile →
            </a>
          </div>

          <p className="mb-5 max-w-[680px] text-[14px] leading-[1.6] text-[var(--color-mute)]">
            Vertical clips below are real, fully-AI renders from the showcase
            profile — image keyframes from <Inline>gemini-3-pro</Inline>,
            motion from <Inline>kling-v3</Inline> · <Inline>veo-3.1</Inline> ·{" "}
            <Inline>seedance</Inline>, voice from{" "}
            <Inline>eleven-multilingual-v2</Inline>. New family-specific
            showreels (commercials · hyper-motion · horror · fruit drama ·
            talking head) drop here as each template lands.
          </p>

          <div className="mb-6 flex flex-wrap items-center gap-2">
            <Chip icon={<SparkMark />} label="all renders < 10 min each" />
            <Chip icon={<BoltMark />} label="< $1 / clip in API costs" />
            <Chip icon={<CheckMark />} label="zero post-production" />
          </div>

          <div className="-mx-7 overflow-x-auto px-7 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:overflow-visible md:px-0">
            <div className="grid auto-cols-[78%] grid-flow-col gap-4 snap-x snap-mandatory pb-2 sm:auto-cols-[58%] md:auto-cols-auto md:grid-flow-row md:grid-cols-3 md:snap-none lg:grid-cols-4 lg:gap-5 xl:grid-cols-6">
              {clips.map((c, i) => (
                <div key={c.id} className="snap-start md:snap-none">
                  <VideoCard clip={c} eager={i < 3} />
                </div>
              ))}
            </div>
          </div>

          <p
            className="mt-4 flex items-center gap-2 text-[12px] text-[var(--color-mute)] md:hidden"
            style={{ fontFamily: "var(--font-pixel)", letterSpacing: "0.06em" }}
          >
            <span className="pulse-dot" />
            swipe for all 12 →
          </p>
        </Block>
      </div>
    </section>
  );
}
