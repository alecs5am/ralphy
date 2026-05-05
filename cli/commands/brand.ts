import { Command } from "commander";
import { addEntity, getEntity, updateEntity, deleteEntity, listEntities } from "../lib/registry.js";
import { slugify } from "../lib/ids.js";
import { out, ok, err } from "../lib/output.js";

export function brandCmd() {
  const cmd = new Command("brand").description("Manage brands (design systems)");

  cmd
    .command("create")
    .description("Create a new brand")
    .requiredOption("--name <name>", "Brand name")
    .option("--url <url>", "Website URL")
    .option("--primary <color>", "Primary color")
    .option("--secondary <color>", "Secondary color")
    .option("--accent <color>", "Accent color")
    .option("--font <family>", "Font family")
    .action(async (opts) => {
      const id = slugify(opts.name);
      const data: Record<string, unknown> = {
        name: opts.name,
        slug: id,
        createdAt: new Date().toISOString(),
      };
      if (opts.url) data.url = opts.url;
      if (opts.primary || opts.secondary || opts.accent) {
        data.colors = {
          ...(opts.primary && { primary: opts.primary }),
          ...(opts.secondary && { secondary: opts.secondary }),
          ...(opts.accent && { accent: opts.accent }),
        };
      }
      if (opts.font) data.font = opts.font;

      const brand = await addEntity("brands", id, data);
      ok(`Brand created: ${id}`);
      out(brand);
    });

  cmd
    .command("list")
    .description("List all brands")
    .action(async () => {
      const brands = await listEntities("brands");
      out(
        brands.map((b: any) => ({
          id: b.id,
          name: b.name,
          url: b.url || "—",
        }))
      );
    });

  cmd
    .command("show <id>")
    .description("Show brand details")
    .action(async (id: string) => {
      const brand = await getEntity("brands", id);
      if (!brand) err(`Brand not found: ${id}`);
      out(brand);
    });

  cmd
    .command("update <id>")
    .description("Update a brand")
    .option("--name <name>", "New name")
    .option("--url <url>", "New URL")
    .option("--primary <color>", "Primary color")
    .action(async (id: string, opts: any) => {
      const updates: Record<string, unknown> = {};
      if (opts.name) updates.name = opts.name;
      if (opts.url) updates.url = opts.url;
      if (opts.primary) updates.colors = { primary: opts.primary };
      const brand = await updateEntity("brands", id, updates);
      if (!brand) err(`Brand not found: ${id}`);
      ok(`Brand updated: ${id}`);
      out(brand);
    });

  cmd
    .command("delete <id>")
    .description("Delete a brand")
    .action(async (id: string) => {
      const ok_ = await deleteEntity("brands", id);
      if (!ok_) err(`Brand not found: ${id}`);
      ok(`Brand deleted: ${id}`);
      out({ deleted: id });
    });

  return cmd;
}
