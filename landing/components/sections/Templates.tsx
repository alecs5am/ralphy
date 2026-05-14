import { styles as styleFamilies } from "@/lib/data";
import { I } from "../Icons";
import { SectionHead } from "../SectionPrimitives";

export function Templates() {
  return (
    <section id="templates">
      <div className="container">
        <SectionHead
          eyebrow="templates"
          title={
            <>
              A growing <span className="acc">template library.</span>
            </>
          }
          sub="Five style families today, more landing each week. Every entry is a fork-and-tweak starter — drop your product, restyle, render in one command."
        />
        <div className="style-grid">
          {styleFamilies.map((s) => (
            <div key={s.id} className="style-tile">
              <div className="head">
                <span className="kicker">{s.kicker}</span>
                <span className={`pill pill-${s.status === "live" ? "live" : "soon"}`}>{s.status}</span>
              </div>
              <div className="ttl">{s.title}</div>
              <p className="copy">{s.copy}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 justify-center" style={{ marginTop: 18 }}>
          <span className="chip">
            <span className="ic">
              <I.spark />
            </span>
            MIT-licensed
          </span>
          <span className="chip">
            <span className="ic">
              <I.bolt />
            </span>
            rebrand-friendly
          </span>
          <span className="chip">
            <span className="ic">
              <I.check />
            </span>
            one command to fork
          </span>
          <span className="chip muted">+ new families weekly</span>
        </div>
      </div>
    </section>
  );
}
