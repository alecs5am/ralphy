import { Command } from "commander";
import { resolveCommandContext } from "../lib/context.js";
import { raiseError } from "../lib/errors/index.js";
import { out } from "../lib/output.js";
import { ralphDir } from "../lib/paths.js";
import {
  createUnitWithRevision,
  getPresentationCaptionRevision,
  getUnit,
  getUnitRevision,
  listPresentationCaptionRevisions,
  listPresentationItems,
  listUnitItems,
  listUnitPresentations,
  listUnits,
  reviseUnit,
  selectUnitRevision,
  type ReviseUnitInput,
  type UnitItemInput,
  type UnitPresentationInput,
} from "../lib/store/units.js";
import {
  StoreConflictError,
  type JsonValue,
  type PresentationCaptionState,
  type PresentationItemDto,
  type UnitPresentationDto,
} from "../lib/store/types.js";
import type { QueryContext } from "../lib/store/scope-context.js";

type ResolvedContext = ReturnType<typeof resolveCommandContext>;

type PresentationView = UnitPresentationDto & {
  captions: ReturnType<typeof listPresentationCaptionRevisions>["items"];
  items: PresentationItemDto[];
};

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

  return command;
}

function unitRevisionView(
  context: QueryContext,
  unitId: string,
  revisionId: string,
) {
  const unit = getUnit({ context, unitId });
  const revision = getUnitRevision({ context, revisionId });
  if (revision.unitId !== unit.id) {
    raiseError("E_NOT_FOUND", { kind: "Unit Revision", id: revisionId });
  }
  const items = allPages((after) =>
    listUnitItems({ context, revisionId, after, limit: 100 }),
  );
  const presentations = allPages((after) =>
    listUnitPresentations({ context, revisionId, after, limit: 100 }),
  ).map<PresentationView>((presentation) => ({
    ...presentation,
    captions: allPages((after) =>
      listPresentationCaptionRevisions({
        context,
        presentationId: presentation.id,
        after,
        limit: 100,
      }),
    ),
    items: allPages((after) =>
      listPresentationItems({
        context,
        presentationId: presentation.id,
        after,
        limit: 100,
      }),
    ),
  }));
  return { unit, revision, items, presentations };
}

function revisionInput(
  context: QueryContext,
  revisionId: string,
): { items: ReviseUnitInput["items"]; presentations: UnitPresentationInput[] } {
  const view = unitRevisionView(
    context,
    getUnitRevision({ context, revisionId }).unitId,
    revisionId,
  );
  const itemPositions = new Map(view.items.map((item) => [item.id, item.position]));
  return {
    items: view.items.map((item) => ({
      artifactRevisionId: item.artifactRevisionId,
      documentRevisionId: item.documentRevisionId,
      role: item.role,
      position: item.position,
      config: item.config,
    })),
    presentations: view.presentations.map((presentation) => ({
      platform: presentation.platform,
      position: presentation.position,
      captions: presentation.captions.map((caption) => ({
        state: caption.state,
        text: caption.text,
      })),
      effectiveCaptionRevisionNo:
        presentation.effectiveCaptionRevisionId === null
          ? null
          : presentation.captions.find(
              (caption) => caption.id === presentation.effectiveCaptionRevisionId,
            )?.revisionNo ?? null,
      coverArtifactRevisionId: presentation.coverArtifactRevisionId,
      crop: presentation.crop,
      safeArea: presentation.safeArea,
      options: presentation.options,
      items: presentation.items.map((item) => ({
        unitItemPosition: itemPositions.get(item.unitItemId)!,
        position: item.position,
        config: item.config,
      })),
    })),
  };
}

function allPages<T>(
  read: (after: string | null) => { items: T[]; nextCursor: string | null },
): T[] {
  const items: T[] = [];
  let after: string | null = null;
  do {
    const page = read(after);
    items.push(...page.items);
    after = page.nextCursor;
  } while (after !== null);
  return items;
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
