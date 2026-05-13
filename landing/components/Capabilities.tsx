import type { ReactNode } from "react";
import { Block, Inline, Mono } from "./Block";
import {
  SparkMark,
  VideoMark,
  RemotionMark,
  BoltMark,
  CheckMark,
  TerminalMark,
} from "./icons";

/* ──────────────────────────────────────────────
   Chapters /01 → /03.  These open the page-as-
   narrative pattern; every later section follows
   the exact same Block layout.

   /01 is the operator-facing 4-step workflow:
       trend-watch → style-clone → render → iterate.
   /02 sells model orchestration (the *how*).
   /03 sells cost (the *why now*) — agency vs Ralphy.
   ────────────────────────────────────────────── */

type WorkflowStep = {
  n: string;
  icon: ReactNode;
  title: string;
  copy: ReactNode;
};

const workflow: WorkflowStep[] = [
  {
    n: "01 · trend-watch",
    icon: <BoltMark />,
    title: "See what's spiking",
    copy: (
      <>
        Drop a niche or an <Inline>@handle</Inline>. Ralphy crawls TikTok,
        Reels, Shorts, and reports what&apos;s gaining velocity{" "}
        <em>before</em> it peaks — with hooks, formats, and reference URLs
        ready to clone.
      </>
    ),
  },
  {
    n: "02 · style-clone",
    icon: <VideoMark />,
    title: "Clone any look",
    copy: (
      <>
        Paste any URL or pick from the template library —{" "}
        <Inline>commercials</Inline>, <Inline>hyper-motion</Inline>,{" "}
        <Inline>horror shorts</Inline>, <Inline>fruit dramas</Inline>,{" "}
        <Inline>talking head</Inline>. The look transfers; the script and
        product are yours.
      </>
    ),
  },
  {
    n: "03 · render & ship",
    icon: <RemotionMark />,
    title: "Image · motion · voice",
    copy: (
      <>
        Image keyframes, video, voiceover, music, captions — composed through{" "}
        <Inline>Remotion</Inline> in roughly 8 minutes for around{" "}
        <Inline cyan>$10</Inline>. Every source file stays on your disk.
      </>
    ),
  },
  {
    n: "04 · iterate from data",
    icon: <CheckMark />,
    title: "Learn, kill, double down",
    copy: (
      <>
        Plug your views, watch-time, and conversions back into the project.
        Ralphy keeps the variants that move the needle and retires the ones
        that don&apos;t — automatically, on the next run.
      </>
    ),
  },
];

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
            ··  how it works
          </p>
        </header>

        <Block
          n="01"
          noTopBorder
          title={<>A whole content team. One prompt. Four moves.</>}
          lede={
            <>
              You stay in chat. Ralphy spots the trend, locks the look, ships
              the render, and learns from the numbers — looping until something
              actually performs.{" "}
              <Inline>&ldquo;Make 10 TikToks about my SaaS.&rdquo;</Inline>{" "}
              <Inline>&ldquo;Adapt this Reel to a hyper-motion spot.&rdquo;</Inline>{" "}
              <Inline>&ldquo;Same script, talking-head style.&rdquo;</Inline>{" "}
              No timeline, no shot list, no plug-ins to learn.
            </>
          }
        >
          <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-2 lg:grid-cols-4">
            {workflow.map((s) => (
              <li
                key={s.n}
                className="relative flex h-full flex-col gap-3 bg-[rgb(6_9_15/0.78)] p-5 backdrop-blur-md"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-[12px] uppercase tracking-[0.06em] text-[var(--color-cyan)]"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    {s.n}
                  </span>
                  <span className="grid h-7 w-7 place-items-center rounded-md border border-[var(--color-line)] text-[var(--color-cyan)]">
                    {s.icon}
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

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[rgb(10_18_32/0.4)] px-5 py-4 text-[13px] text-[var(--color-mute)]">
            <span
              className="inline-flex items-center gap-2"
              style={{ fontFamily: "var(--font-pixel)", letterSpacing: "0.06em" }}
            >
              <span className="pulse-dot" />
              loop until your numbers move ↳
            </span>
            <span
              className="flex flex-wrap items-center gap-x-5 gap-y-1.5"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              <span>
                <span className="text-[var(--color-cyan)]">+</span> customers
              </span>
              <span>
                <span className="text-[var(--color-cyan)]">+</span> revenue
              </span>
              <span>
                <span className="text-[var(--color-cyan)]">+</span> reach
              </span>
              <span>
                <span className="text-[var(--color-cyan)]">−</span> Adobe
              </span>
            </span>
          </div>
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
          title={<>A whole content team for less than your last invoice.</>}
          lede={
            <>
              The agency way:{" "}
              <Inline strike>$800 · 3 weeks · 5 people</Inline>. The freelance
              edit: <Inline strike>$200 · a week · one cut</Inline>. The
              Ralphy way: <Inline cyan>~$10 · ~8 minutes · just you</Inline> —
              that tenner is{" "}
              <PriceTag model="openai/gpt-image-2" price="~$0.04/img" /> +{" "}
              <PriceTag
                model="google/gemini-3-pro-image"
                price="~$0.04/img"
              />{" "}
              + <PriceTag model="bytedance/seedance-2.0" price="~$0.40/5s" /> +{" "}
              <PriceTag model="klingai/kling-v3.0-i2v" price="~$0.49/5s" />,
              billed straight through Vercel AI Gateway. The self-critic loop
              iterates until the AI score plateaus, so you&apos;re not
              babysitting the renderer — and you keep every source file in your
              repo, ready to A/B against next week&apos;s analytics.
            </>
          }
        >
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px] text-[var(--color-mute)]">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[rgb(10_18_32/0.5)] px-2.5 py-1"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              <SparkMark className="text-[var(--color-cyan)]" />
              you keep the keys
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[rgb(10_18_32/0.5)] px-2.5 py-1"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              <TerminalMark className="text-[var(--color-cyan)]" />
              you keep the source files
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[rgb(10_18_32/0.5)] px-2.5 py-1"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              <CheckMark className="text-[var(--color-cyan)]" />
              MIT, no upsell
            </span>
          </div>
        </Block>
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
