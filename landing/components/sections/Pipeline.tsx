import { pipeline } from "@/lib/data";
import { SectionHead } from "../SectionPrimitives";

export function Pipeline() {
  return (
    <section id="pipeline">
      <div className="container">
        <SectionHead
          eyebrow="under the hood"
          title={
            <>
              Five orchestrated sub-agents. <span className="acc">One mp4.</span>
            </>
          }
          sub="Under every prompt, five quiet workers your agent dispatches in sequence. Each writes to the same workspace. None charge per seat."
        />
        <div className="style-grid">
          {pipeline.map((s) => (
            <div key={s.n} className="style-tile">
              <div className="head">
                <span className="kicker">{s.n}</span>
              </div>
              <div className="ttl">{s.t}</div>
              <p className="copy">{s.d}</p>
            </div>
          ))}
        </div>
        <div
          className="flex flex-wrap gap-2 justify-center"
          style={{
            marginTop: 18,
            padding: "14px 18px",
            background: "var(--bg-1)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: "var(--ink-3)",
            justifyContent: "space-between",
          }}
        >
          <span style={{ color: "var(--ink)" }}>one prompt → finished mp4</span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            <span>
              <b style={{ color: "var(--vio)" }}>~8m</b> wall-clock
            </span>
            <span>
              <b style={{ color: "var(--vio)" }}>~$10</b> in API
            </span>
            <span>
              <b style={{ color: "var(--vio)" }}>12</b> iterations
            </span>
            <span>
              <b style={{ color: "var(--vio)" }}>0</b> humans waiting
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
