"use client";

// Shared unit-listing GRID wrapper (#089).
//
// The auto-fill responsive grid used by the block page's "units that use this"
// section (`.block-units-grid`). Renders canonical <UnitCard>s and owns the
// RemixModal state internally, so callers (BlockUnits) stay thin — they pass
// data, this wraps the modal wiring + the per-card Remix payload.
//
// No visible borders: separation via bg-tint + shadow + spacing only.

import { useMemo, useState } from "react";
import type { Block, BlockKind, Format, Unit } from "@/lib/library-v2/types";
import { RemixModal } from "./RemixModal";
import { remixForUnit } from "./remix";
import type { RemixPayload } from "./types";
import { UnitCard } from "./UnitCard";

export function UnitGrid({
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
      <div className="block-units-grid">
        {units.map((u) => (
          <UnitCard
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
