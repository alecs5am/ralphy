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
      <div className="container">
        <SectionHead
          eyebrow="open source"
          title={
            <>
              Built with operators. <span className="acc">Not at them.</span>
            </>
          }
          sub="The best skills, templates, and prompts come from the founders, marketers, and operators running it every day. Push your style family — the next person ships with your playbook on day one."
        />

        <div className="channel-grid" style={{ marginBottom: 14 }}>
          {ways.map((w) => (
            <div key={w.head} className="channel-card hl-card">
              <h3 className="hl-title">{renderHL(w.head, w.hl)}</h3>
              <p>{w.copy}</p>
            </div>
          ))}
        </div>

        <div className="channel-grid">
          {channels.map((c) => (
            <a key={c.id} className="channel-card channel-row" href={c.href} target="_blank" rel="noopener">
              <div className="channel-head">
                <h3>{c.title}</h3>
                <img className="channel-brand-icon" src={`/assets/brands/${c.id}.svg`} alt="" />
              </div>
              <p>{c.desc}</p>
              <span className="arr">{c.arr}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
