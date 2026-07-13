// `ralphy library` — read the PUBLIC content library from the static library.json
// document served on Bunny CDN (read-only). The foundation for retiring the local
// templates/ folder (notes/issues/084).
//
//   ralphy library units      list | show <id>
//   ralphy library templates  list | show <id>   (blocks, kind=template)
//   ralphy library recipes    list | show <id>   (blocks, kind=recipe)
//   ralphy library assets     list | show <id>   (blocks, kind=asset)
//   ralphy library blueprints list | show <unit-id>
//   ralphy library formats    list                (static taxonomy)
//
// JSON by default (machine-friendly); `-p` renders a pretty table. There is NO
// write/insert/publish path here — publishing lives in the companion
// ralphy-web repository.

import { Command } from "commander";
import { out, err } from "../lib/output.js";
import {
  getUnits,
  getUnit,
  getBlocks,
  getBlock,
  getBlueprint,
  getBlueprints,
  getFormats,
} from "../lib/library/client.js";
import type { BlockKind } from "../lib/library/types.js";

/** The `library <entity>` selectors and how each maps to the client. */
const BLOCK_ENTITIES: Record<string, BlockKind> = {
  templates: "template",
  recipes: "recipe",
  assets: "asset",
};

async function runListUnits(): Promise<void> {
  const units = await getUnits();
  out(
    units.map((u) => ({
      id: u.id,
      format: u.format,
      title: u.title,
      mediaCount: u.mediaCount,
      tags: u.tags ?? [],
    })),
  );
}

async function runShowUnit(id: string): Promise<void> {
  const unit = await getUnit(id);
  if (!unit) err(`No unit with id '${id}' in the public library`);
  out(unit);
}

async function runListBlocks(kind: BlockKind): Promise<void> {
  const blocks = await getBlocks(kind);
  out(
    blocks.map((b) => ({
      id: b.id,
      name: b.name,
      ...(b.sub != null ? { sub: b.sub } : {}),
      ...(b.recipeKind != null ? { recipeKind: b.recipeKind } : {}),
      blurb: b.blurb,
    })),
  );
}

async function runShowBlock(kind: BlockKind, id: string): Promise<void> {
  const block = await getBlock(kind, id);
  if (!block) err(`No ${kind} block with id '${id}' in the public library`);
  out(block);
}

async function runListBlueprints(): Promise<void> {
  const blueprints = await getBlueprints();
  out(blueprints.map((b) => ({ unitId: b.unitId, createdAt: b.createdAt ?? null })));
}

async function runShowBlueprint(unitId: string): Promise<void> {
  const bp = await getBlueprint(unitId);
  if (!bp) err(`No blueprint for unit '${unitId}' in the public library`);
  out(bp);
}

/** Wrap an async action so a thrown client Error becomes an err(...) exit. */
function guard(fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await fn();
    } catch (e) {
      err(e instanceof Error ? e.message : String(e));
    }
  };
}

export function libraryCmd() {
  const cmd = new Command("library").description(
    "Read the public content library (units, blocks, blueprints, formats) from the static library.json on Bunny CDN (read-only)",
  );

  // ── units ───────────────────────────────────────────────────────────────--
  const units = cmd.command("units").description("Finished deliverables (Units)");
  units.command("list").description("List all units").action(guard(runListUnits));
  units
    .command("show <id>")
    .description("Show one unit by id")
    .action((id: string) => guard(() => runShowUnit(id))());

  // ── block entities (templates / recipes / assets) ──────────────────────────
  for (const [entity, kind] of Object.entries(BLOCK_ENTITIES)) {
    const sub = cmd.command(entity).description(`Reusable ${kind} blocks`);
    sub
      .command("list")
      .description(`List all ${entity}`)
      .action(guard(() => runListBlocks(kind)));
    sub
      .command("show <id>")
      .description(`Show one ${kind} block by id`)
      .action((id: string) => guard(() => runShowBlock(kind, id))());
  }

  // ── blueprints ──────────────────────────────────────────────────────────--
  const blueprints = cmd.command("blueprints").description("Per-unit reproduction blueprints");
  blueprints.command("list").description("List all blueprints").action(guard(runListBlueprints));
  blueprints
    .command("show <unit-id>")
    .description("Show one blueprint by its unit id")
    .action((unitId: string) => guard(() => runShowBlueprint(unitId))());

  // ── formats (static taxonomy) ──────────────────────────────────────────────
  const formats = cmd.command("formats").description("The media-format taxonomy (static)");
  formats
    .command("list")
    .description("List all formats")
    .action(guard(async () => out(await getFormats())));

  cmd.addHelpText(
    "after",
    `
Examples:
  ralphy library units list
  ralphy library units show animated-fb-ad
  ralphy library templates list
  ralphy library recipes show noir-grade
  ralphy library blueprints list
  ralphy library blueprints show choose-magicschool
  ralphy library formats list

Source: static library.json on Bunny CDN (override the URL with RALPHY_LIBRARY_URL).
`,
  );

  return cmd;
}
