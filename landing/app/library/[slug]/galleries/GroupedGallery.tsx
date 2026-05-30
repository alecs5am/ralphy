"use client";

// GroupedGallery — renders showcase outputs grouped into titled sub-sections
// (issue 060). Used for `fb-creative` (group by campaign set A/B/C/D/E) and any
// other format that authored a `group` on its outputs. Each group is its own
// titled grid of MediaPlayer tiles (images + videos), so the fullscreen
// lightbox + expand affordance are the exact shared components used everywhere
// else. No visible borders: groups separate via the section header + spacing.

import type { ShowcaseOutput } from "@/lib/showcase-loader";
import { MediaPlayer } from "@/components/MediaPlayer";

interface Group {
  id: string;
  title: string;
  items: ShowcaseOutput[];
}

function groupOutputs(outputs: ShowcaseOutput[]): Group[] {
  const order: string[] = [];
  const byId = new Map<string, Group>();
  for (const o of outputs) {
    const id = o.group ?? "__ungrouped";
    if (!byId.has(id)) {
      byId.set(id, { id, title: o.groupTitle ?? o.group ?? "Outputs", items: [] });
      order.push(id);
    }
    const g = byId.get(id)!;
    if (o.groupTitle && (!g.title || g.title === g.id)) g.title = o.groupTitle;
    g.items.push(o);
  }
  return order.map((id) => byId.get(id)!);
}

export function GroupedGallery({ outputs }: { outputs: ShowcaseOutput[] }) {
  const groups = groupOutputs(outputs);
  return (
    <div className="flex flex-col gap-12">
      {groups.map((g) => (
        <section key={g.id}>
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h3 className="font-display text-[19px] leading-[1.15] m-0 font-semibold text-ink tracking-[-0.01em]">
              {g.title}
            </h3>
            <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-mute tabular-nums shrink-0">
              {g.items.length}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-[18px] max-[1100px]:grid-cols-3 max-[760px]:grid-cols-2 max-[460px]:grid-cols-1">
            {g.items.map((o) => (
              <figure key={o.id} className="m-0 min-w-0">
                <MediaPlayer
                  kind={o.kind}
                  src={o.src}
                  poster={o.poster}
                  alt={o.caption ?? o.id}
                  aspect={o.aspect}
                  autoPlay={o.kind === "video"}
                  defaultMuted
                />
                {o.caption && (
                  <figcaption className="text-[12.5px] leading-[1.45] text-ink-3 pt-2.5 px-0.5">
                    {o.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
