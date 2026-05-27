import type { ReactNode } from "react";
import { ways, channels } from "@/lib/data";
import { I } from "../Icons";
import { Highlighter } from "../Highlighter";
import { SectionHead } from "../SectionPrimitives";

function renderHL(full: string, key: string): ReactNode {
  const lower = full.toLowerCase();
  const idx = lower.indexOf(key.toLowerCase());
  if (idx === -1) return full;
  return (
    <>
      {full.slice(0, idx)}
      <Highlighter action="highlight" iterations={2} padding={1}>
        {full.slice(idx, idx + key.length)}
      </Highlighter>
      {full.slice(idx + key.length)}
    </>
  );
}

// Reserved for future use — currently channels use brand SVG icons instead.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function chanGlyph(k: string): ReactNode {
  return (
    {
      discord: <I.discord />,
      github: <I.github />,
      x: <I.x />,
      docs: <I.book />,
    }[k] || <I.book />
  );
}

export function Community() {
  return (
    <section id="community">
      <div className="container container-w-1480">
        <SectionHead
          eyebrow="open source"
          title={
            <>
              Built with operators. <span className="acc">Not at them.</span>
            </>
          }
          sub="The best skills, templates, and prompts come from the founders, marketers, and operators running it every day. Push your style family — the next person ships with your playbook on day one."
        />

        <div className="grid grid-cols-1 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-4 gap-3 mb-[14px]">
          {ways.map((w) => (
            <div
              key={w.head}
              className="flex flex-col gap-3 pt-[26px] px-[26px] pb-6 bg-bg-1 rounded-[20px] min-h-[200px] transition-colors hover:bg-bg-2"
            >
              <h3 className="font-display font-bold text-[21.5px] text-ink m-0 uppercase tracking-[-0.008em] leading-[1.2]">
                {renderHL(w.head, w.hl)}
              </h3>
              <p className="flex-1 text-[14px] leading-[1.6] text-ink-3 m-0">{w.copy}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-4 gap-3">
          {channels.map((c) => (
            <a
              key={c.id}
              className="flex flex-col gap-3 pt-[26px] px-[26px] pb-6 bg-bg-1 rounded-[20px] min-h-[200px] transition-[background,transform] duration-[180ms] hover:bg-bg-2 hover:-translate-y-0.5"
              href={c.href}
              target="_blank"
              rel="noopener"
            >
              <div className="flex items-center justify-between gap-[10px]">
                <h3 className="font-display font-bold text-[21.5px] text-ink m-0 uppercase tracking-[-0.008em]">{c.title}</h3>
                <img className="h-[26px] w-auto max-w-[110px] block shrink-0" src={`/assets/brands/${c.id}.svg`} alt="" />
              </div>
              <p className="flex-1 text-[14px] leading-[1.6] text-ink-3 m-0">{c.desc}</p>
              <span className="font-mono text-vio text-[13px]">{c.arr}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
