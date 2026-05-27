import { stack } from "@/lib/data";
import { I } from "../Icons";
import { SectionHead } from "../SectionPrimitives";
import { Chip } from "../Chip";

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
        <div className="bg-bg-1 rounded-[22px] py-3 px-[30px] max-[700px]:py-2 max-[700px]:px-[18px] max-[700px]:rounded-[18px]">
          <div className="grid grid-cols-1 max-[700px]:gap-3 min-[701px]:grid-cols-[200px_1fr] gap-6 items-start py-[22px] max-[700px]:py-[18px]">
            <div className="font-mono text-mute text-[14.5px] max-[700px]:text-[13.5px] tracking-[0.005em] pt-2 max-[700px]:pt-0">lives inside</div>
            <div className="flex flex-wrap gap-[10px]">
              {stack.inside.map((c, i) => (
                <Chip key={i} muted={c.muted} brand={c.icon ?? undefined} icon={c.icon && I[c.icon] ? I[c.icon]() : undefined}>
                  {c.label}
                </Chip>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 max-[700px]:gap-3 min-[701px]:grid-cols-[200px_1fr] gap-6 items-start py-[22px] max-[700px]:py-[18px]">
            <div className="font-mono text-mute text-[14.5px] max-[700px]:text-[13.5px] tracking-[0.005em] pt-2 max-[700px]:pt-0">powered by</div>
            <div className="flex flex-wrap gap-[10px]">
              {stack.powered.map((c, i) => (
                <Chip key={i} muted={c.muted} brand={c.icon ?? undefined} icon={c.icon && I[c.icon] ? I[c.icon]() : undefined}>
                  {c.label}
                </Chip>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 max-[700px]:gap-3 min-[701px]:grid-cols-[200px_1fr] gap-6 items-start py-[22px] max-[700px]:py-[18px]">
            <div className="font-mono text-mute text-[14.5px] max-[700px]:text-[13.5px] tracking-[0.005em] pt-2 max-[700px]:pt-0">ship as</div>
            <div className="flex flex-wrap gap-[10px]">
              {stack.ship.map((c, i) => (
                <Chip key={i} muted={c.muted} brand={c.icon ?? undefined} icon={c.icon && I[c.icon] ? I[c.icon]() : undefined}>
                  {c.label}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
