"use client";

// Library v2 — Screen 3 body: "Units that use this block".
//
// Thin delegate to the shared <UnitGrid> (#089): the server page resolves the
// units + the flat block list; <UnitGrid> renders the canonical <UnitCard>s in
// the auto-fill `.block-units-grid` and owns the RemixModal state internally.
// No bespoke tile markup or remix builder here anymore.

import type { Block, Format, Unit } from "@/lib/library-v2/types";
import { UnitGrid } from "../../../_shared/UnitGrid";

export function BlockUnits({
  units,
  formats,
  blocks,
}: {
  units: Unit[];
  formats: Format[];
  blocks: Block[];
}) {
  return <UnitGrid units={units} formats={formats} blocks={blocks} />;
}
