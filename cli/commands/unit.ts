import { Command } from "commander";
import { resolveCommandContext } from "../lib/context.js";
import { raiseError } from "../lib/errors/index.js";
import { out } from "../lib/output.js";
import { ralphDir } from "../lib/paths.js";
import {
  createUnitWithRevision,
  getPresentationCaptionRevision,
  getUnit,
  listUnits,
  reviseUnit,
  selectUnitRevision,
  setUnitSource,
  type UnitItemInput,
  type UnitPresentationInput,
} from "../lib/store/units.js";
import {
  StoreConflictError,
  type JsonValue,
  type PresentationCaptionState,
} from "../lib/store/types.js";
import type { QueryContext } from "../lib/store/scope-context.js";
import {
  resolveUnitReference,
  unitContext,
  unitRevisionInput as revisionInput,
  unitRevisionView,
} from "../lib/unit-revision.js";
import {
  LEDGER_FIELDS,
  deriveDecisions,
  effectiveDecisions,
  gatherLedgerSources,
  normalizeLedgerKey,
  orderLedgerKeys,
  orderRecord,
  parseLedgerAssignment,
  readStoredLedger,
  writeLedger,
  type DerivedDecisions,
  type ManualDecisions,
} from "../lib/analytics/ledger.js";
import { MetricParseError } from "../lib/analytics/metric-parse.js";
import { runOriginalityCheck } from "../lib/originality/check.js";
import {
  pathTarget,
  locationTarget,
  projectRefTargets,
  resolveAgainst,
  sourceLinkTarget,
  workspaceUnitTargets,
  type OriginalityTarget,
  type SkippedTarget,
} from "../lib/originality/targets.js";
import { textFromFileContent } from "../lib/originality/script-similarity.js";
import fs from "node:fs";
import path from "node:path";

type ResolvedContext = ReturnType<typeof resolveCommandContext>;

export function unitCmd(): Command {
  const command = new Command("unit").description(
    "Manage immutable publishable Units and platform presentations",
  );

  command
    .command("create")
    .description("Create a Unit identity and its first sealed revision")
    .option("--workspace <id>", "Workspace ID")
    .option("--project <id>", "Project ID")
    .requiredOption("--slug <slug>", "Unit slug")
    .requiredOption("--format <format>", "Unit format")
    .requiredOption("--items <json>", "Ordered Artifact/Document revision items")
    .option("--presentations <json>", "Ordered platform presentations", "[]")
    .option("--note <text>", "Revision note")
    .action((opts, child: Command) => {
      const context = resolve(child, opts.project);
      try {
        const items = jsonArray<UnitItemInput>(opts.items, "items");
        const presentations = jsonArray<UnitPresentationInput>(
          opts.presentations,
          "presentations",
        );
        const revision = context.projectId
          ? createUnitWithRevision({
              projectId: context.projectId,
              slug: opts.slug,
              format: opts.format,
              note: opts.note,
              items,
              presentations,
              ...sessionAuthor(context),
            })
          : createUnitWithRevision({
              workspaceId: context.workspaceId,
              slug: opts.slug,
              format: opts.format,
              note: opts.note,
              items,
              presentations,
              ...sessionAuthor(context),
            });
        out(unitRevisionView(queryContext(context), revision.unitId, revision.id));
      } catch (error) {
        conflict(error, "Unit", opts.slug);
      }
    });

  command
    .command("source <id>")
    .description("Link an exact original revision without adding a variant")
    .requiredOption("--revision <id>", "Original sealed Unit revision in the same scope")
    .requiredOption("--label <text>", "Source label, for example an import provider or uploaded file")
    .option("--expected <id>", "Expected source revision ID or none", "none")
    .action((id: string, opts, child: Command) => {
      const context = resolve(child);
      out(setUnitSource({ context: queryContext(context), unitId: id, revisionId: opts.revision, label: opts.label, expectedSourceRevisionId: opts.expected === "none" ? null : opts.expected }));
    });

  command
    .command("list")
    .description("List Units in the explicit scope")
    .option("--workspace <id>", "Workspace ID")
    .option("--project <id>", "Project ID")
    .option("--cursor <cursor>", "Continue from an opaque cursor")
    .option("--limit <count>", "Maximum rows", parseCount, 50)
    .action((opts, child: Command) => {
      const context = resolve(child, opts.project);
      out(
        listUnits({
          context: queryContext(context),
          after: opts.cursor,
          limit: opts.limit,
        }),
      );
    });

  command
    .command("show <id>")
    .description("Show a Unit and one exact sealed revision graph")
    .option("--workspace <id>", "Workspace ID")
    .option("--project <id>", "Project ID")
    .option("--revision <id>", "Revision ID; defaults to latest")
    .action((id: string, opts, child: Command) => {
      const context = resolve(child, opts.project);
      const unit = getUnit({ context: queryContext(context), unitId: id });
      const revisionId = opts.revision ?? unit.latestRevisionId;
      if (!revisionId) {
        out({ unit, revision: null, items: [], presentations: [] });
        return;
      }
      out(unitRevisionView(queryContext(context), unit.id, revisionId));
    });

  command
    .command("revise <id>")
    .description("Append a sealed Unit revision")
    .requiredOption("--expected <revision-id>", "Expected latest revision ID or none")
    .requiredOption("--items <json>", "Complete ordered Artifact/Document revision items")
    .option("--presentations <json>", "Complete ordered platform presentations", "[]")
    .option("--parent <revision-id>", "Parent revision ID")
    .option("--iteration <id>", "Project Iteration ID")
    .option("--note <text>", "Revision note")
    .action((id: string, opts, child: Command) => {
      const context = resolve(child);
      getUnit({ context: queryContext(context), unitId: id });
      try {
        const revision = reviseUnit({
          unitId: id,
          expectedLatestRevisionId: expected(opts.expected),
          ...(opts.parent ? { parentRevisionId: opts.parent } : {}),
          ...(opts.iteration ? { iterationId: opts.iteration } : {}),
          ...(opts.note ? { note: opts.note } : {}),
          items: jsonArray<UnitItemInput>(opts.items, "items"),
          presentations: jsonArray<UnitPresentationInput>(
            opts.presentations,
            "presentations",
          ),
          ...sessionAuthor(context),
        });
        out(unitRevisionView(queryContext(context), id, revision.id));
      } catch (error) {
        conflict(error, "Unit", id);
      }
    });

  command
    .command("select <id>")
    .description("Select one sealed Unit revision independently of latest")
    .requiredOption("--revision <id>", "Revision ID")
    .requiredOption("--expected <revision-id>", "Expected selected revision ID or none")
    .action((id: string, opts, child: Command) => {
      const context = resolve(child);
      getUnit({ context: queryContext(context), unitId: id });
      try {
        out(
          selectUnitRevision({
            unitId: id,
            revisionId: opts.revision,
            expectedSelectedRevisionId: expected(opts.expected),
          }),
        );
      } catch (error) {
        conflict(error, "Unit", id);
      }
    });

  command
    .command("add <id>")
    .description("Append one exact item by creating a new sealed revision")
    .requiredOption("--expected <revision-id>", "Expected latest revision ID")
    .option("--artifact-revision <id>", "Artifact Revision ID")
    .option("--document-revision <id>", "Document Revision ID")
    .requiredOption("--role <role>", "Unit item role")
    .option("--config <json>", "Safe item configuration")
    .action((id: string, opts, child: Command) => {
      const context = resolve(child);
      const expectedRevisionId = expected(opts.expected);
      if (expectedRevisionId === null) {
        raiseError("E_INPUT_INVALID", {
          field: "expected",
          detail: "unit add requires an existing latest revision",
        });
      }
      if (Boolean(opts.artifactRevision) === Boolean(opts.documentRevision)) {
        raiseError("E_INPUT_INVALID", {
          field: "item",
          detail: "pass exactly one --artifact-revision or --document-revision",
        });
      }
      try {
        const prior = revisionInput(queryContext(context), expectedRevisionId);
        const revision = reviseUnit({
          unitId: id,
          expectedLatestRevisionId: expectedRevisionId,
          items: [
            ...prior.items,
            {
              artifactRevisionId: opts.artifactRevision ?? null,
              documentRevisionId: opts.documentRevision ?? null,
              role: opts.role,
              position: prior.items.length,
              ...(opts.config
                ? { config: jsonValue(opts.config, "config") }
                : {}),
            },
          ],
          presentations: prior.presentations,
          ...sessionAuthor(context),
        });
        out(unitRevisionView(queryContext(context), id, revision.id));
      } catch (error) {
        conflict(error, "Unit", id);
      }
    });

  command
    .command("caption <id>")
    .description("Append immutable platform caption history in a new Unit revision")
    .requiredOption("--expected <revision-id>", "Expected latest revision ID")
    .requiredOption("--platform <platform>", "Canonical platform")
    .requiredOption("--text <text>", "Effective caption text")
    .option(
      "--state <state>",
      "draft | humanized | auto-draft-archived | final",
      "humanized",
    )
    .action((id: string, opts, child: Command) => {
      const context = resolve(child);
      const expectedRevisionId = expected(opts.expected);
      if (expectedRevisionId === null) {
        raiseError("E_INPUT_INVALID", {
          field: "expected",
          detail: "unit caption requires an existing latest revision",
        });
      }
      const state = captionState(opts.state);
      try {
        const prior = revisionInput(queryContext(context), expectedRevisionId);
        let target = prior.presentations.find(
          (presentation) => presentation.platform === opts.platform,
        );
        if (!target) {
          target = {
            platform: opts.platform,
            position: prior.presentations.length,
            captions: [],
            effectiveCaptionRevisionNo: null,
            coverArtifactRevisionId: null,
            crop: null,
            safeArea: null,
            options: {},
            items: [],
          };
          prior.presentations.push(target);
        }
        const priorCaptions = target.captions ?? [];
        const currentIndex = target.effectiveCaptionRevisionNo;
        const currentText =
          currentIndex == null ? null : priorCaptions[currentIndex - 1]?.text ?? null;
        const captions = [
          ...priorCaptions,
          ...(currentText === null
            ? []
            : [{ state: "auto-draft-archived" as const, text: currentText }]),
          { state, text: opts.text },
        ];
        target.captions = captions;
        target.effectiveCaptionRevisionNo = captions.length;
        const revision = reviseUnit({
          unitId: id,
          expectedLatestRevisionId: expectedRevisionId,
          items: prior.items,
          presentations: prior.presentations,
          ...sessionAuthor(context),
        });
        out(unitRevisionView(queryContext(context), id, revision.id));
      } catch (error) {
        conflict(error, "Unit", id);
      }
    });

  command
    .command("preview <id>")
    .description("Resolve one platform preview from an exact Unit revision")
    .requiredOption("--platform <platform>", "Canonical platform")
    .option("--revision <id>", "Revision ID; defaults to selected, then latest")
    .action((id: string, opts, child: Command) => {
      const context = resolve(child);
      const query = queryContext(context);
      const unit = getUnit({ context: query, unitId: id });
      const revisionId = opts.revision ?? unit.selectedRevisionId ?? unit.latestRevisionId;
      if (!revisionId) {
        raiseError("E_NOT_FOUND", { kind: "Unit Revision", id });
      }
      const view = unitRevisionView(query, id, revisionId);
      const presentation = view.presentations.find(
        (candidate) => candidate.platform === opts.platform,
      );
      if (!presentation) {
        raiseError("E_NOT_FOUND", {
          kind: "Unit Presentation",
          id: opts.platform,
        });
      }
      const caption = presentation.effectiveCaptionRevisionId
        ? getPresentationCaptionRevision({
            context: query,
            captionRevisionId: presentation.effectiveCaptionRevisionId,
          }).text
        : null;
      const byId = new Map(view.items.map((item) => [item.id, item]));
      const inheritedItems = presentation.items.length === 0;
      const items = inheritedItems
        ? view.items
        : presentation.items.map((item) => ({
            ...byId.get(item.unitItemId)!,
            position: item.position,
            presentationConfig: item.config,
          }));
      out({
        unitId: unit.id,
        revisionId,
        platform: presentation.platform,
        presentationId: presentation.id,
        inheritedItems,
        captionRevisionId: presentation.effectiveCaptionRevisionId,
        caption,
        coverArtifactRevisionId: presentation.coverArtifactRevisionId,
        crop: presentation.crop,
        safeArea: presentation.safeArea,
        options: presentation.options,
        items,
      });
    });

  // ── decisions (#558) ──────────────────────────────────────────────────────
  // The decision ledger: the choices that produced a Unit, derived from its
  // artifacts plus manual entries, joined to outcomes by `analytics report`.
  command
    .command("decisions <unit>")
    .description(
      `Show or record a Unit's decision ledger (the choices that produced it: ${LEDGER_FIELDS.map((field) => field.key).join(", ")}). Derived from the plan, scenario, prompts, asset manifest, gen-log, unit manifest, and composition; --set adds manual entries. Read-only unless --derive / --set / --unset.`,
    )
    .option("--set <key=value>", "Record a manual decision (repeatable; comma list for sets; empty or none suppresses)", collect, [])
    .option("--unset <key>", "Drop a manual decision (repeatable)", collect, [])
    .option("--derive", "Store a fresh derivation from the project artifacts")
    .option("--from <dir>", "Project working directory to derive from (default: the conventional project directory)")
    .action((ref: string, opts, child: Command) => {
      const resolved = resolve(child);
      const context = queryContext(resolved);
      const location = resolveUnitReference(context, ref);
      const scoped = unitContext(context, location);
      let sets: Array<{ key: string; value: ReturnType<typeof parseLedgerAssignment>["value"] }>;
      let unsets: string[];
      try {
        sets = (opts.set as string[]).map(parseLedgerAssignment);
        unsets = (opts.unset as string[]).map(normalizeLedgerKey);
      } catch (error) {
        if (error instanceof MetricParseError) {
          raiseError("E_INPUT_INVALID", { field: "set", detail: error.message });
        }
        throw error;
      }
      let gathered: ReturnType<typeof gatherLedgerSources>;
      try {
        gathered = gatherLedgerSources(scoped, location, opts.from);
      } catch (error) {
        if (error instanceof MetricParseError) {
          raiseError("E_INPUT_INVALID", { field: "from", detail: error.message });
        }
        throw error;
      }
      const fresh = deriveDecisions(gathered.sources);
      const stored = readStoredLedger(scoped, location.unitId);
      const write = Boolean(opts.derive) || sets.length > 0 || unsets.length > 0;
      // --set / --unset alone keep the stored derivation (what produced the
      // Unit); --derive, or a first write, takes the fresh one.
      const keepStored = Boolean(stored?.body) && !opts.derive;
      const derived: DerivedDecisions = keepStored ? stored!.body!.derived : fresh;
      const derivedFrom = keepStored ? stored!.body!.derivedFrom : gathered.derivedFrom;
      const manual: ManualDecisions = { ...(stored?.body?.manual ?? {}) };
      for (const key of unsets) delete manual[key];
      for (const { key, value } of sets) manual[key] = value;
      let storedRef = stored ? { documentId: stored.documentId, revisionId: stored.revisionId } : null;
      let written = false;
      if (write) {
        const result = writeLedger({
          context: scoped,
          location,
          derived,
          manual,
          derivedFrom,
          ...sessionAuthor(resolved),
        });
        storedRef = { documentId: result.documentId, revisionId: result.revisionId };
        written = result.written;
      }
      out({
        unit: {
          id: location.unitId,
          slug: location.slug,
          format: location.format,
          projectId: location.projectId,
        },
        written,
        stored: storedRef,
        decisions: orderRecord(effectiveDecisions(derived, manual)),
        manual: orderRecord(manual),
        derived: orderLedgerKeys(Object.keys(derived)).map((key) => ({
          key,
          value: derived[key]!.value,
          source: derived[key]!.source,
        })),
        derivedFrom,
        // What --derive would change against the stored ledger.
        staleKeys: keepStored ? changedKeys(derived, fresh) : [],
        projectDirectory: gathered.projectDirectory,
        ...(write
          ? {}
          : { next: stored ? "Pass --derive to refresh the derivation, or --set key=value to record a choice." : "Not stored yet: pass --derive to store it, or --set key=value for choices the artifacts do not record." }),
      });
    });

  // ── originality (#561) ────────────────────────────────────────────────────
  // Duplicate-risk check before render or publish: local perceptual frame
  // hashes, an audio fingerprint, and script similarity against the
  // Workspace's earlier Units and the reference source. Read-only.
  command
    .command("originality <unit>")
    .description(
      "Check whether a Unit (or a media / script file) would read as a duplicate or reused content against the Workspace's other Units, its linked source, and its Project's artifacts/refs/ (#561). Local only, no provider calls: perceptual frame hashes (pHash + dHash, mirror-tested), an audio fingerprint, and script 3-gram similarity. Prints a score per axis (visual, audio, script) and an overall likely-duplicate | similar | original verdict; thresholds in docs/research/originality.md. Read-only.",
    )
    .option("--against <ref>", "Compare against a Unit, a Project (all its Units), a media file, or a directory of media (repeatable; replaces the default set)", collect, [])
    .option("--limit <count>", "Maximum Workspace Units compared in the default set", parseCount, 50)
    .option("--script <file>", "Script or transcript for the subject (.txt, .md, .srt, .vtt, .json); overrides sidecars and Unit documents")
    .action(async (ref: string, opts, child: Command) => {
      const against = opts.against as string[];
      const subjectIsFile = fs.existsSync(ref) && fs.statSync(ref).isFile();
      let context: QueryContext | null = null;
      try {
        context = queryContext(resolve(child));
      } catch (error) {
        // Plain files compare without a store; a Unit reference needs one.
        if (!subjectIsFile || against.length === 0) throw error;
      }
      const skipped: SkippedTarget[] = [];
      const targets: OriginalityTarget[] = [];
      let subject: OriginalityTarget;
      const exclude = new Set<string>();
      let subjectLocation: ReturnType<typeof resolveUnitReference> | null = null;
      if (subjectIsFile) {
        subject = pathTarget(ref, "subject");
      } else {
        subjectLocation = resolveUnitReference(context!, ref);
        const resolved = locationTarget(context!, subjectLocation, "subject");
        if ("reason" in resolved) {
          raiseError("E_INPUT_INVALID", { field: "unit", detail: `${ref}: ${resolved.reason}` });
        }
        subject = resolved;
        exclude.add(subjectLocation.unitId);
      }
      if (opts.script) {
        if (!fs.existsSync(opts.script)) raiseError("E_FILE_UNREADABLE", { path: opts.script });
        const text = textFromFileContent(fs.readFileSync(opts.script, "utf8"), path.extname(opts.script));
        subject = { ...subject, script: text || null, scriptSource: `file:${path.basename(opts.script)}` };
      }
      if (against.length > 0) {
        for (const value of against) {
          const resolved = resolveAgainst(value, context, exclude);
          targets.push(...resolved.targets);
          skipped.push(...resolved.skipped);
        }
      } else if (context) {
        const workspaceId = subjectLocation?.workspaceId ?? workspaceOf(child);
        if (subjectLocation) {
          const source = sourceLinkTarget(context, subjectLocation);
          if (source && "reason" in source) skipped.push(source);
          else if (source) targets.push(source);
          targets.push(...projectRefTargets(subjectLocation));
        }
        if (workspaceId) {
          const workspace = workspaceUnitTargets(context, workspaceId, exclude, opts.limit);
          targets.push(...workspace.targets);
          skipped.push(...workspace.skipped);
        }
      }
      try {
        out(await runOriginalityCheck({ subject, targets, skipped }));
      } catch (error) {
        raiseError("E_FILE_UNREADABLE", { path: subject.path ?? ref, detail: (error as Error).message.slice(0, 300) });
      }
    })
    .addHelpText("after", `
Verdicts:
  likely-duplicate  same footage in the same order (mirror / speed / grade / crop / trim still match),
                    or the same soundtrack over reused footage
  similar           footage, soundtrack, or script reused with real edits (re-cut, new VO, new order)
  original          nothing above the similar thresholds

Examples:
  $ ralphy unit originality spring-hero --workspace kettle-brand
  $ ralphy unit originality spring-hero --against spring-hero-v1 --against ./refs/source.mp4
  $ ralphy unit originality render/final.mp4 --against ./earlier-cuts/
`);

  return command;
}

/** The Workspace ID of the resolved command scope (null for a Session). */
function workspaceOf(child: Command): string | null {
  const context = resolve(child);
  return context.kind === "session" ? null : context.workspaceId;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/**
 * Keys the artifacts now derive differently from the stored ledger (what
 * --derive would change). A key the current sources cannot derive at all is
 * not reported: a missing source is not evidence of a changed decision.
 */
function changedKeys(stored: DerivedDecisions, fresh: DerivedDecisions): string[] {
  return orderLedgerKeys(Object.keys(fresh)).filter((key) =>
    JSON.stringify(stored[key]?.value ?? null) !== JSON.stringify(fresh[key]!.value)
  );
}

function resolve(child: Command, projectId?: string): ResolvedContext {
  const opts = child.optsWithGlobals();
  return resolveCommandContext({
    dataRoot: ralphDir(),
    sessionId: opts.session,
    workspaceId: opts.workspace,
    projectId: projectId ?? opts.project,
    cwd: process.cwd(),
  });
}

function queryContext(context: ResolvedContext): QueryContext {
  return context.kind === "session"
    ? { sessionId: context.sessionId }
    : {
        workspaceId: context.workspaceId,
        ...(context.projectId ? { projectId: context.projectId } : {}),
      };
}

function sessionAuthor(
  context: ResolvedContext,
): { authoredBySessionId?: string } {
  return context.kind === "session"
    ? { authoredBySessionId: context.sessionId }
    : {};
}

function expected(value: string): string | null {
  return value === "none" ? null : value;
}

function jsonValue(value: string, field: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    raiseError("E_INPUT_INVALID", { field, detail: "expected JSON" });
  }
}

function jsonArray<T>(value: string, field: string): T[] {
  const parsed = jsonValue(value, field);
  if (!Array.isArray(parsed)) {
    raiseError("E_INPUT_INVALID", { field, detail: "expected a JSON array" });
  }
  return parsed as T[];
}

function captionState(value: string): PresentationCaptionState {
  const states = new Set<PresentationCaptionState>([
    "draft",
    "humanized",
    "auto-draft-archived",
    "final",
  ]);
  if (!states.has(value as PresentationCaptionState)) {
    raiseError("E_INPUT_INVALID", {
      field: "state",
      detail: "expected draft, humanized, auto-draft-archived, or final",
    });
  }
  return value as PresentationCaptionState;
}

function parseCount(value: string): number {
  return Number(value);
}

function conflict(error: unknown, kind: string, id: string): never {
  if (error instanceof StoreConflictError) {
    raiseError("E_CONFLICT", { kind, id });
  }
  throw error;
}
