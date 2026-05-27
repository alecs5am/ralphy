import { styles as styleFamilies } from "@/lib/data";
import { I } from "../Icons";
import { SectionHead } from "../SectionPrimitives";
import { Chip } from "../Chip";

export function Templates() {
  return (
    <section id="templates">
      <div className="container container-w-1760">
        <SectionHead
          eyebrow="templates"
          title={
            <>
              A growing <span className="acc">template library.</span>
            </>
          }
          sub="Five style families today, more landing each week. Every entry is a fork-and-tweak starter — drop your product, restyle, render in one command."
        />
        <div className="grid gap-[10px] grid-cols-1 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-5">
          {styleFamilies.map((s) => (
            <div
              key={s.id}
              className="bg-bg-1 rounded-2xl pt-6 px-6 pb-[22px] flex flex-col gap-[14px] transition-colors hover:bg-bg-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-mute text-[13px] tracking-[0.04em]">{s.kicker}</span>
                <span
                  className={`inline-flex items-center px-[7px] py-0.5 rounded-[4px] font-mono text-[10.5px] tracking-[0.04em] uppercase ${
                    s.status === "live" ? "bg-vio text-bg" : "bg-bg-3 text-mute"
                  }`}
                >
                  {s.status}
                </span>
              </div>
              <div className="font-display font-bold text-[18.5px] tracking-[-0.008em] text-ink uppercase leading-[1.15]">{s.title}</div>
              <p className="text-[14px] text-ink-3 leading-[1.55]">{s.copy}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 justify-center mt-[18px]">
          <Chip icon={<I.spark />}>MIT-licensed</Chip>
          <Chip icon={<I.bolt />}>rebrand-friendly</Chip>
          <Chip icon={<I.check />}>one command to fork</Chip>
          <Chip muted>+ new families weekly</Chip>
        </div>
      </div>
    </section>
  );
}
