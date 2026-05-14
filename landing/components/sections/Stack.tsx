import { stack } from "@/lib/data";
import { I } from "../Icons";
import { SectionHead } from "../SectionPrimitives";

export function StackSection() {
  return (
    <section id="stack">
      <div className="container">
        <SectionHead
          eyebrow="stack"
          title={
            <>
              Not a SaaS. <span className="acc">A toolkit you fork.</span>
            </>
          }
          sub="Ralphy is glue. Skills live as markdown. The model registry is one file. The template library is open. MIT, always — your keys, your repo, your files."
        />
        <div className="stack-card">
          <div className="chip-row">
            <div className="lbl">lives inside</div>
            <div className="chips-wrap">
              {stack.inside.map((c, i) => (
                <span key={i} className={`chip ${c.muted ? "muted" : ""}`}>
                  {c.icon && I[c.icon] && (
                    <span className="ic">
                      {I[c.icon]()}
                    </span>
                  )}
                  {c.label}
                </span>
              ))}
            </div>
          </div>
          <div className="chip-row">
            <div className="lbl">powered by</div>
            <div className="chips-wrap">
              {stack.powered.map((c, i) => (
                <span key={i} className={`chip ${c.muted ? "muted" : ""}`}>
                  {c.icon && I[c.icon] && (
                    <span className="ic">
                      {I[c.icon]()}
                    </span>
                  )}
                  {c.label}
                </span>
              ))}
            </div>
          </div>
          <div className="chip-row">
            <div className="lbl">ship as</div>
            <div className="chips-wrap">
              {stack.ship.map((c, i) => (
                <span key={i} className={`chip ${c.muted ? "muted" : ""}`}>
                  {c.icon && I[c.icon] && (
                    <span className="ic">
                      {I[c.icon]()}
                    </span>
                  )}
                  {c.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
