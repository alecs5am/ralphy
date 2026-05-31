"use client";

// Library v2 — Screen 3 body: "Units that use this block" masonry. A thin client
// island around the shared UnitTile so each tile can open the shared RemixModal
// (the tile's Remix action needs a click handler + local modal state). The server
// page resolves the units + the flat block list; this component only wires the
// per-tile Remix payload, identical to the feed (LibraryListing) tile section.

import { useMemo, useState } from "react";
import type { Block, BlockKind, Format, Unit } from "@/lib/library-v2/types";
import { mediaUrl } from "../../../_shared/blockMeta";
import { RemixModal } from "../../../_shared/RemixModal";
import type { RemixPayload } from "../../../_shared/types";
import { UnitTile } from "../../../_shared/UnitTile";

function remixForUnit(u: Unit, f: Format | undefined): RemixPayload {
  const firstMedia = u.media && u.media.length > 0 ? u.media[0] : undefined;
  const thumb = firstMedia
    ? { kind: firstMedia.kind, src: mediaUrl(firstMedia) }
    : f
      ? { glyph: f.glyph }
      : undefined;
  return {
    tag: `@unit:${u.id}`,
    cli: `ralphy remix ${u.id}`,
    title: u.title,
    eyebrow: "Remix this unit",
    from: f ? `${f.label} · keeps everything you didn't touch` : undefined,
    thumb,
    swapHint:
      "say what to swap (a character, a location, the style). Ralphy reads the unit's recipe and re-runs only what your swap touches, keeping the rest pinned.",
  };
}

export function BlockUnits({
  units,
  formats,
  blocks,
}: {
  units: Unit[];
  formats: Format[];
  blocks: Block[];
}) {
  const [remix, setRemix] = useState<RemixPayload | null>(null);

  const formatById = useMemo(() => {
    const m: Record<string, Format> = {};
    for (const f of formats) m[f.id] = f;
    return m;
  }, [formats]);

  const blockBy = useMemo(() => {
    const m = new Map<string, Block>();
    for (const b of blocks) m.set(`${b.kind}:${b.id}`, b);
    return (kind: BlockKind, id: string) => m.get(`${kind}:${id}`);
  }, [blocks]);

  return (
    <>
      <div className="masonry">
        {units.map((u) => (
          <UnitTile
            key={u.id}
            u={u}
            format={formatById[u.format]}
            blockBy={blockBy}
            onRemix={() => setRemix(remixForUnit(u, formatById[u.format]))}
          />
        ))}
      </div>
      <RemixModal payload={remix} onClose={() => setRemix(null)} />
    </>
  );
}
