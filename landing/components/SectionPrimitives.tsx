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
    <div className="text-center mb-10">
      {eyebrow && (
        <div className="eyebrow eyebrow-hl">
          <Highlighter action="underline" strokeWidth={2} padding={3} iterations={2}>
            {eyebrow}
          </Highlighter>
        </div>
      )}
      <h2
        className="font-display font-bold text-[clamp(28px,4.5vw,56px)] tracking-[-0.02em] leading-none uppercase text-ink mx-auto max-w-[22ch] text-balance [&_.acc]:text-vio"
        style={{ marginTop: eyebrow ? 14 : 0 }}
      >
        {title}
      </h2>
      {sub && (
        <p className="mt-4 mx-auto max-w-[620px] text-[clamp(14.5px,1.05vw,16px)] text-ink-3 leading-[1.55]">
          {sub}
        </p>
      )}
    </div>
  );
}

export function TerminalBlock({ title = "Terminal", lines }: { title?: string; lines: ReactNode }) {
  return (
    <div className="bg-bg-1 rounded-[14px] overflow-hidden">
      <div className="flex items-center justify-between py-[10px] px-[14px] bg-bg-1 font-mono text-[12.5px] text-mute">
        <div className="flex items-center gap-3">
          <span className="inline-flex gap-1.5">
            <span className="w-[9px] h-[9px] rounded-full bg-[#555]" />
            <span className="w-[9px] h-[9px] rounded-full bg-[#555]" />
            <span className="w-[9px] h-[9px] rounded-full bg-[#555]" />
          </span>
          <span>{title}</span>
        </div>
      </div>
      <pre className="bg-[#050506] text-ink font-mono text-[14.5px] leading-[1.7] py-[22px] px-[26px] overflow-x-auto whitespace-pre m-0 [&_.cmt]:text-mute-2 [&_.prm]:text-vio [&_.ok]:text-[#B0E3B5] [&_.acc]:text-vio-2 [&_.dim]:text-mute [&_.keyword]:text-vio [&_.str]:text-[#E0D6A8]">
        {lines}
      </pre>
    </div>
  );
}

