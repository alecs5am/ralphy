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
        <div className="grid gap-[10px] grid-cols-1 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-5">
          {pipeline.map((s) => (
            <div
              key={s.n}
              className="bg-bg-1 rounded-2xl pt-6 px-6 pb-[22px] flex flex-col gap-[14px] transition-colors hover:bg-bg-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-mute text-[13px] tracking-[0.04em]">{s.n}</span>
              </div>
              <div className="font-display font-bold text-[18.5px] tracking-[-0.008em] text-ink uppercase leading-[1.15]">{s.t}</div>
              <p className="text-[14px] text-ink-3 leading-[1.55]">{s.d}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 justify-between mt-4 py-5 px-[26px] bg-bg-1 rounded-[18px] font-mono text-[14px] text-ink-3">
          <span className="text-ink">one prompt → finished mp4</span>
          <span className="flex flex-wrap gap-[18px]">
            <span>
              <b className="text-vio">~8m</b> wall-clock
            </span>
            <span>
              <b className="text-vio">~$10</b> in API
            </span>
            <span>
              <b className="text-vio">12</b> iterations
            </span>
            <span>
              <b className="text-vio">0</b> humans waiting
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
