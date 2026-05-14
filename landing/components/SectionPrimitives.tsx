import type { ReactNode } from "react";
import { Highlighter } from "./Highlighter";

export function SectionHead({
  eyebrow,
  title,
  sub,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="section-head">
      {eyebrow && (
        <div className="eyebrow eyebrow-hl">
          <Highlighter action="underline" strokeWidth={2} padding={3} iterations={2}>
            {eyebrow}
          </Highlighter>
        </div>
      )}
      <h2 style={{ marginTop: eyebrow ? 14 : 0 }}>{title}</h2>
      {sub && <p className="sub">{sub}</p>}
    </div>
  );
}

export function TerminalBlock({ title = "Terminal", lines }: { title?: string; lines: ReactNode }) {
  return (
    <div className="term">
      <div className="term-bar">
        <div className="flex items-center gap-3">
          <span className="tty-lights">
            <span className="r" />
            <span className="y" />
            <span className="g" />
          </span>
          <span>{title}</span>
        </div>
      </div>
      <pre className="term-body">{lines}</pre>
    </div>
  );
}

export function Duo({
  reverse,
  kicker,
  title,
  copy,
  terminal,
}: {
  reverse?: boolean;
  kicker?: ReactNode;
  title: ReactNode;
  copy: ReactNode;
  terminal: ReactNode;
}) {
  return (
    <div className={`duo ${reverse ? "reverse" : ""}`}>
      <div className="copy-side">
        {kicker && <span className="kicker">{kicker}</span>}
        <h3>{title}</h3>
        <p>{copy}</p>
      </div>
      <div className="term-side">{terminal}</div>
    </div>
  );
}
