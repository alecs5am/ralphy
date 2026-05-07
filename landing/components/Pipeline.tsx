import type { ReactNode } from "react";
import { Block, Inline } from "./Block";
import {
  SparkMark,
  TerminalMark,
  VideoMark,
  RemotionMark,
  CheckMark,
} from "./icons";

const steps: {
  n: string;
  icon: ReactNode;
  t: string;
  d: ReactNode;
}[] = [
  {
    n: "01 · idea",
    icon: <TerminalMark />,
    t: "Capture",
    d: <>One sentence in chat. Ralphy stretches it into a brief.</>,
  },
  {
    n: "02 · prompt",
    icon: <SparkMark />,
    t: "Optimize",
    d: <>Templates + model rules turn the brief into shot prompts.</>,
  },
  {
    n: "03 · board",
    icon: <VideoMark />,
    t: "Plan",
    d: <>A 5-shot storyboard, references attached, durations locked.</>,
  },
  {
    n: "04 · render",
    icon: <RemotionMark />,
    t: "Generate",
    d: <>Image · video · voice · music — composed through Remotion.</>,
  },
  {
    n: "05 · refine",
    icon: <CheckMark />,
    t: "Iterate",
    d: <>Critic scores, sliders move, the loop closes itself.</>,
  },
];

export function Pipeline() {
  return (
    <section id="flow" className="relative">
      <div className="mx-auto max-w-[1180px] px-7">
        <Block
          n="05"
          title={<>Five orchestrated agents. One mp4.</>}
          lede={
            <>
              Behind the chat sits a quiet orchestrator routing skills:{" "}
              <Inline>planner</Inline> · <Inline>researcher</Inline> ·{" "}
              <Inline>scenarist</Inline> · <Inline>renderer</Inline> ·{" "}
              <Inline>critic</Inline>. Each writes to the same workspace, each
              remembers the last render, none of them charge per seat.
            </>
          }
        >
          <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {steps.map((s) => (
              <li key={s.n} className="relative flex h-full flex-col gap-3 bg-[rgb(6_9_15/0.78)] p-5 backdrop-blur-md">
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
                  className="text-[22px] italic leading-none text-[var(--color-frost)]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {s.t}
                </div>
                <div className="text-[13px] leading-[1.5] text-[var(--color-mute)]">{s.d}</div>
              </li>
            ))}
          </ol>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[rgb(10_18_32/0.4)] px-5 py-4 text-[13px] text-[var(--color-mute)]">
            <span
              className="inline-flex items-center gap-2"
              style={{ fontFamily: "var(--font-pixel)", letterSpacing: "0.06em" }}
            >
              <span className="pulse-dot" />
              one prompt → finished mp4
            </span>
            <span
              className="flex flex-wrap items-center gap-x-5 gap-y-1.5"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              <span><span className="text-[var(--color-cyan)]">~8m</span> wall-clock</span>
              <span><span className="text-[var(--color-cyan)]">~$10</span> in API</span>
              <span><span className="text-[var(--color-cyan)]">12</span> iterations</span>
              <span><span className="text-[var(--color-cyan)]">0</span> humans waiting</span>
            </span>
          </div>
        </Block>
      </div>
    </section>
  );
}
