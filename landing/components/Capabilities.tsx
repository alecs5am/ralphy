import type { ReactNode } from "react";
import { Block, ChipRow, Chip, Inline, Mono } from "./Block";
import {
  TikTokMark,
  ReelsMark,
  YouTubeMark,
  SparkMark,
  VideoMark,
} from "./icons";

/* ──────────────────────────────────────────────
   Chapters /01 → /03.  These open the page-as-
   narrative pattern; every later section follows
   the exact same Block layout.
   ────────────────────────────────────────────── */

export function Capabilities() {
  return (
    <section id="what" className="relative pt-12 md:pt-16">
      <div className="relative z-10 mx-auto max-w-[1180px] px-7">
        {/* Section tagline lives outside the first block so the /01
            line still reads as the start of a real chapter. */}
        <header className="mb-6 max-w-[720px]">
          <p
            className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            ··  what it does
          </p>
        </header>

        <Block
          n="01"
          noTopBorder
          title={<>Prompt it, don&apos;t produce it.</>}
          lede={
            <>
              Talk to Ralphy like you&apos;d talk to a producer.{" "}
              <Inline>&ldquo;Make 10 TikToks about my SaaS.&rdquo;</Inline>{" "}
              <Inline>&ldquo;Adapt this for Reels.&rdquo;</Inline>{" "}
              <Inline>&ldquo;Same script, soviet-engineer style.&rdquo;</Inline>{" "}
              No timeline, no shot list, no plug-ins to learn.
            </>
          }
        >
          <ChipRow>
            <Chip icon={<TikTokMark />} label="TikTok" />
            <Chip icon={<ReelsMark />} label="Reels" />
            <Chip icon={<YouTubeMark />} label="Shorts" />
            <Chip icon={<VideoMark />} label="UGC ads" />
            <Chip icon={<VideoMark />} label="Launch promos" />
            <Chip icon={<VideoMark />} label="Explainers" />
            <Chip muted label="…or whatever you ship" />
          </ChipRow>
        </Block>

        <Block
          n="02"
          title={<>Every model. One key. Always the best one for the job.</>}
          lede={
            <>
              Ralphy routes through <Inline>OpenRouter</Inline> and{" "}
              <Inline>Vercel AI Gateway</Inline>, so you get the right model
              for the shot — image with{" "}
              <ModelTag model="google/gemini-3-pro-image" /> or{" "}
              <ModelTag model="openai/gpt-image-2" />, motion with{" "}
              <ModelTag model="klingai/kling-v3.0-i2v" /> and{" "}
              <ModelTag model="bytedance/seedance-2.0" />, voice with{" "}
              <ModelTag model="elevenlabs/multilingual-v2" />. When something
              better ships next month, swap a line in <Mono>models.json</Mono>{" "}
              and you&apos;re on it. No new subscription. No vendor lock-in.
            </>
          }
        />

        <Block
          n="03"
          title={<>A content farm that costs less than your Adobe sub.</>}
          lede={
            <>
              The agency way:{" "}
              <Inline strike>$800 · 3 weeks · 5 people</Inline>. The Ralphy
              way: <Inline cyan>~$10 · ~8 minutes · just you</Inline> — that
              tenner is{" "}
              <PriceTag model="openai/gpt-image-2" price="~$0.04/img" /> +{" "}
              <PriceTag model="google/gemini-3-pro-image" price="~$0.04/img" />{" "}
              + <PriceTag model="bytedance/seedance-2.0" price="~$0.40/5s" />{" "}
              + <PriceTag model="klingai/kling-v3.0-i2v" price="~$0.49/5s" />,
              billed straight through Vercel AI Gateway. The self-critic loop
              iterates until the AI score plateaus, so you&apos;re not
              babysitting the renderer — and you keep every source file.
            </>
          }
        />
      </div>
    </section>
  );
}

/* ───────────── inline-chip primitives (sit on the text baseline) ───────────── */

/** Inline model pill — compact, mono-styled, slots inside a paragraph. */
function ModelTag({ model }: { model: string }) {
  return (
    <span
      className="inline-flex translate-y-[1px] items-center gap-1.5 rounded-md border border-[var(--color-line-2)] bg-[rgb(10_18_32/0.6)] px-1.5 py-[1px] text-[12.5px] text-[var(--color-frost)] align-baseline"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <SparkMark className="h-2.5 w-2.5 text-[var(--color-cyan)]" />
      {model}
    </span>
  );
}

/** Inline pricing pill — same shape as ModelTag, with a cyan price tag glued on the right. */
function PriceTag({ model, price }: { model: string; price: string }) {
  return (
    <span
      className="inline-flex translate-y-[1px] items-center gap-1 rounded-md border border-[var(--color-line-2)] bg-[rgb(10_18_32/0.6)] py-[1px] pl-1.5 pr-[3px] text-[12.5px] text-[var(--color-frost)] align-baseline"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {model}
      <span className="rounded-[4px] bg-[rgb(61_216_255/0.14)] px-1.5 py-[1px] text-[11.5px] text-[var(--color-cyan-2)]">
        {price}
      </span>
    </span>
  );
}
