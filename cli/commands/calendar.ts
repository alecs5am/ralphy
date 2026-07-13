// `ralphy calendar` (#504) — the workspace content calendar: recurring
// posting slots + dated entries with a lifecycle. State lives in
// cli/lib/calendar/store.ts.

import { Command } from "commander";
import { existsSync } from "fs";
import { workspaceDir, layoutMode, DEFAULT_WORKSPACE } from "../lib/paths.js";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { WEEKDAYS, PLATFORMS, type Weekday, type Platform } from "../lib/schemas/calendar.js";
import {
  readCalendar,
  addSlot,
  upsertEntry,
  fillCalendar,
  calendarPath,
  calendarEventsPath,
} from "../lib/calendar/store.js";

function requireWorkspace(verb: string, slug: string): string {
  if (layoutMode() === "legacy") raiseError("E_LEGACY_LAYOUT", { verb });
  const dir = workspaceDir(slug);
  if (slug !== DEFAULT_WORKSPACE && !existsSync(dir)) {
    raiseError("E_NOT_FOUND", { kind: "Workspace", id: slug });
  }
  return dir;
}

function parsePlatforms(raw: string | undefined): Platform[] {
  if (!raw) return [];
  const list = raw.split(",").map((p) => p.trim()).filter(Boolean);
  for (const p of list) {
    if (!(PLATFORMS as readonly string[]).includes(p)) {
      raiseError("E_VALIDATION_FAILED", {
        target: "platforms",
        detail: `'${p}' is not a platform (${PLATFORMS.join(" | ")})`,
      });
    }
  }
  return list as Platform[];
}

export function calendarCmd() {
  const cmd = new Command("calendar").description(
    "Workspace content calendar (#504): recurring posting slots (weekday/time/timezone, unit type, platforms) + dated entries with an idea → queued → produced → gated → scheduled → published lifecycle. Stored at <workspace>/calendar.json with an append-only calendar-events.jsonl history.",
  );

  // ── show ─────────────────────────────────────────────────────────────────
  cmd
    .command("show <ws>")
    .description(
      "Show a workspace's calendar: recurring slots + upcoming entries (undated queued entries first, then dated ones from now on; --all includes past entries). Example: ralphy calendar show my-studio",
    )
    .option("--all", "Include past entries (default: undated + upcoming only)")
    .action(async (ws: string, opts) => {
      const dir = requireWorkspace("calendar show", ws);
      const cal = readCalendar(dir);
      const now = Date.now();
      const entries = (opts.all ? cal.entries : cal.entries.filter((e) => !e.at || Date.parse(e.at) >= now)).sort(
        (a, b) => Date.parse(a.at ?? "9999") - Date.parse(b.at ?? "9999"),
      );
      out({
        workspace: ws,
        path: calendarPath(dir),
        slots: cal.slots,
        entries,
        totalEntries: cal.entries.length,
      });
    });

  // ── add ──────────────────────────────────────────────────────────────────
  cmd
    .command("add <ws>")
    .description(
      "Add a recurring slot (--weekday mon..sun --time HH:MM --unit-type <format> [--platforms youtube,tiktok,instagram,x,telegram] [--timezone <IANA>, default: system] [--id <slot-id>]) OR a dated entry (--at <ISO> --unit-type <format> [--platforms ...] [--slot <slot-id>]). Examples: ralphy calendar add my-studio --weekday mon --time 09:00 --unit-type ugc-review --platforms tiktok,youtube | ralphy calendar add my-studio --at 2026-07-13T09:00:00Z --unit-type ugc-review",
    )
    .option("--weekday <d>", `Recurring slot weekday (${WEEKDAYS.join(" | ")})`)
    .option("--time <hh:mm>", "Recurring slot local time, 24h HH:MM")
    .option("--timezone <tz>", "IANA timezone for the slot (default: the system timezone)")
    .option("--at <iso>", "Dated entry datetime (ISO) — selects entry mode instead of slot mode")
    .option("--unit-type <format>", "Format-taxonomy string (see `ralphy template suggest --help`)")
    .option("--platforms <list>", `Comma-separated target platforms (${PLATFORMS.join(" | ")})`)
    .option("--slot <slot-id>", "Entry mode: link the entry to a recurring slot")
    .option("--id <id>", "Explicit id (default: derived slot id / generated entry id)")
    .action(async (ws: string, opts) => {
      const dir = requireWorkspace("calendar add", ws);
      if (!opts.unitType) {
        raiseError("E_VALIDATION_FAILED", { target: "unit-type", detail: "--unit-type is required" });
      }
      const platforms = parsePlatforms(opts.platforms);

      if (opts.at) {
        // Dated entry mode.
        try {
          const { entry } = upsertEntry(dir, {
            id: opts.id,
            at: new Date(opts.at).toISOString(),
            slotId: opts.slot,
            unitType: opts.unitType,
            platforms,
            status: "idea",
          });
          ok(`Entry added: ${entry.id}`);
          out({ workspace: ws, kind: "entry", ...entry });
        } catch (e) {
          raiseError("E_VALIDATION_FAILED", { target: "entry", detail: (e as Error).message });
        }
        return;
      }

      // Recurring slot mode.
      if (!opts.weekday || !opts.time) {
        raiseError("E_VALIDATION_FAILED", {
          target: "slot",
          detail: "a recurring slot needs --weekday and --time (or pass --at for a dated entry)",
        });
      }
      if (!(WEEKDAYS as readonly string[]).includes(opts.weekday)) {
        raiseError("E_VALIDATION_FAILED", {
          target: "weekday",
          detail: `'${opts.weekday}' is not a weekday (${WEEKDAYS.join(" | ")})`,
        });
      }
      const id = opts.id ?? `slot-${opts.weekday}-${String(opts.time).replace(":", "")}`;
      try {
        const slot = addSlot(dir, {
          id,
          weekday: opts.weekday as Weekday,
          time: opts.time,
          ...(opts.timezone ? { timezone: opts.timezone } : {}),
          unitType: opts.unitType,
          targetPlatforms: platforms,
        });
        ok(`Slot added: ${slot.id}`);
        out({ workspace: ws, kind: "slot", ...slot });
      } catch (e) {
        raiseError("E_VALIDATION_FAILED", { target: "slot", detail: (e as Error).message });
      }
    });

  // ── fill ─────────────────────────────────────────────────────────────────
  cmd
    .command("fill <ws>")
    .description(
      "Auto-fill: create QUEUED entries for every slot occurrence in the next N weeks that is not already filled (idempotent — a second run creates nothing). Example: ralphy calendar fill my-studio --weeks 2",
    )
    .option("--weeks <n>", "How many weeks ahead to fill (default 1)", (v) => parseInt(v, 10), 1)
    .action(async (ws: string, opts) => {
      const dir = requireWorkspace("calendar fill", ws);
      const weeks = Number.isFinite(opts.weeks) && opts.weeks > 0 ? opts.weeks : 1;
      const { created, skipped } = fillCalendar(dir, { weeks });
      ok(`Filled ${created.length} entr${created.length === 1 ? "y" : "ies"} (${skipped} already filled)`);
      out({
        workspace: ws,
        weeks,
        created: created.length,
        skipped,
        entries: created,
        eventsLog: calendarEventsPath(dir),
      });
    });

  return cmd;
}
