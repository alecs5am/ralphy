// Build a Unit provenance GRAPH (#420) from project state.
//
// `buildProvenanceGraph(projectId, slug)` scans the project dir READ-ONLY and
// assembles the reproduction chain (brief → research → style lock → prompts →
// source refs → generated assets → render → eval → council → repair → final
// media). Every input is BEST-EFFORT: an absent artifact simply omits its node,
// a malformed file is skipped — the function NEVER throws and NEVER mutates the
// project (it is a pure read + assemble, in line with the append-only contract).
//
// The graph is the rich companion to the compact `UnitProvenanceSchema`
// (template/style/recipes/assets); it is persisted as a sibling `provenance.json`
// (storage rationale in `cli/lib/schemas/provenance-graph.ts`).

import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { projectDir } from "./paths.js";
import { readGenerations } from "./gen-log.js";
import {
  ProvenanceGraphSchema,
  type ProvenanceGraph,
  type ProvenanceNode,
} from "./schemas/provenance-graph.js";

/** Read + JSON.parse a project-relative file, or null on any failure. */
function safeReadJson(dir: string, rel: string): unknown {
  try {
    const abs = path.join(dir, rel);
    if (!existsSync(abs)) return null;
    return JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
}

/** True when a project-relative file exists. Never throws. */
function present(dir: string, rel: string): boolean {
  try {
    return existsSync(path.join(dir, rel));
  } catch {
    return false;
  }
}

/**
 * The asset-manifest slot shape we read (mirrors the writer in
 * `cli/commands/generate.ts`). All fields optional — we read defensively.
 */
interface ManifestSlot {
  kind?: string;
  path?: string;
  model?: string;
  costUsd?: number;
  url?: string;
  generatedAt?: string;
}

/**
 * Build the provenance graph for a unit from the project's logs/manifests.
 *
 * @param projectId  the project the unit was formed from.
 * @param slug       the unit slug (recorded on the graph for cross-walk).
 * @returns          a validated ProvenanceGraph. Always returns (best-effort);
 *                   a project with nothing on disk yields a graph with no nodes.
 */
export async function buildProvenanceGraph(
  projectId: string,
  slug: string,
): Promise<ProvenanceGraph> {
  const dir = projectDir(projectId);
  const nodes: ProvenanceNode[] = [];

  const add = (n: Partial<ProvenanceNode> & Pick<ProvenanceNode, "id" | "kind">) =>
    nodes.push({
      label: "",
      parents: [],
      selectedVariants: [],
      rejectedVariants: [],
      ...n,
    });

  // ── brief ────────────────────────────────────────────────────────────────
  if (present(dir, "BRIEF.md")) {
    add({ id: "brief", kind: "brief", label: "Brief", ref: "BRIEF.md" });
  }

  // ── research facts ─────────────────────────────────────────────────────────
  const researchRef = "artifacts/refs/research-facts.json";
  if (present(dir, researchRef)) {
    add({
      id: "research-facts",
      kind: "research-facts",
      label: "Research facts",
      ref: researchRef,
      parents: nodes.some((n) => n.id === "brief") ? ["brief"] : [],
    });
  }

  // ── style lock ─────────────────────────────────────────────────────────────
  if (present(dir, "STYLE_LOCK.md")) {
    add({
      id: "style-lock",
      kind: "style-lock",
      label: "Style lock",
      ref: "STYLE_LOCK.md",
      parents: nodes.filter((n) => n.id === "brief" || n.id === "research-facts").map((n) => n.id),
    });
  }

  // ── source refs (the `refs` kind, #105) ─────────────────────────────────────
  // Best-effort: surface user-supplied references from user-assets.jsonl when
  // present (they carry purpose + localPath). One node per logged ref-like asset.
  for (const asset of await readUserAssets(projectId)) {
    if (!asset.localPath && !asset.dest && !asset.source) continue;
    const ref = asset.localPath ?? asset.dest ?? asset.source;
    add({
      id: `ref:${ref}`,
      kind: "source-ref",
      label: asset.purpose ? `Ref (${asset.purpose})` : "Source ref",
      ref,
    });
  }

  // ── prompts ────────────────────────────────────────────────────────────────
  const planParents = nodes
    .filter((n) => n.id === "style-lock" || n.id === "research-facts" || n.id === "brief")
    .map((n) => n.id);
  if (present(dir, "prompts.json")) {
    add({
      id: "prompts",
      kind: "prompt",
      label: "Prompts",
      ref: "prompts.json",
      parents: planParents,
    });
  }

  // ── generated assets (from the manifest slots + gen-log cost/model/variants) ──
  const assetNodeIds = await addGeneratedAssetNodes(dir, projectId, nodes, add);

  // ── render ─────────────────────────────────────────────────────────────────
  const renderRef = "render/final.mp4";
  const hasRender = present(dir, renderRef);
  if (hasRender) {
    add({
      id: "render",
      kind: "render",
      label: "Render",
      ref: renderRef,
      parents: assetNodeIds,
    });
  }

  // ── eval report ──────────────────────────────────────────────────────────────
  if (present(dir, "eval.json")) {
    add({
      id: "eval",
      kind: "eval-report",
      label: "Eval report",
      ref: "eval.json",
      parents: hasRender ? ["render"] : [],
    });
  }

  // ── council reports (preflight + polish, append-only auto-versions ignored) ──
  for (const phase of ["preflight", "polish"] as const) {
    const ref = `council-${phase}.json`;
    if (present(dir, ref)) {
      add({
        id: `council-${phase}`,
        kind: "council-report",
        label: `Council (${phase})`,
        ref,
        parents: phase === "polish" && present(dir, "eval.json") ? ["eval"] : [],
      });
    }
  }

  // ── repair plan ──────────────────────────────────────────────────────────────
  if (present(dir, "repair-plan.json")) {
    add({
      id: "repair-plan",
      kind: "repair-plan",
      label: "Repair plan",
      ref: "repair-plan.json",
      parents: present(dir, "eval.json") ? ["eval"] : [],
    });
  }

  // ── final media (the rendered deliverable / shipped mp4) ──────────────────────
  if (hasRender) {
    add({
      id: "final-media",
      kind: "final-media",
      label: "Final media",
      ref: renderRef,
      parents: ["render"],
    });
  }

  // ponytail: variant-tournament champion/loser provenance (#421). When a
  // project is the CHAMPION of a `ralphy batch tournament` run, the durable
  // record is the batch's `<batch>/tournament.json` (TournamentResult — ranked
  // entries + champion + preserved losers with rationale). The natural #420 seam
  // is to populate `final-media.selectedVariants` with the champion id and
  // `final-media.rejectedVariants` with the loser ids. We DON'T wire it here
  // because a project does not durably record which batch it belongs to (the
  // batch→projects map lives in `<batch>/state.json`, with no reverse index), so
  // resolving the tournament would require scanning every batch dir — the kind
  // of cross-cutting rewrite the issue warns off. The per-asset selected/rejected
  // split below ALREADY captures slot-level variant decisions; the batch-level
  // tournament decision lives in `tournament.json`. Wire this when the registry
  // grows a project→batch back-reference (then read tournament.json once here).

  const totalCostUsd = Number(
    nodes.reduce((sum, n) => sum + (n.modelCall?.costUsd ?? 0), 0).toFixed(4),
  );

  return ProvenanceGraphSchema.parse({
    version: 1,
    slug,
    projectId,
    generatedAt: new Date().toISOString(),
    nodes,
    totalCostUsd,
  });
}

/**
 * Add one `generated-asset` node per asset-manifest slot, enriched with the
 * gen-log cost / model / selected+rejected variants. Returns the ids of the
 * nodes added (so `render` can parent on them). Best-effort: no manifest → no
 * asset nodes, no crash.
 */
async function addGeneratedAssetNodes(
  dir: string,
  projectId: string,
  nodes: ProvenanceNode[],
  add: (n: Partial<ProvenanceNode> & Pick<ProvenanceNode, "id" | "kind">) => void,
): Promise<string[]> {
  const manifest = safeReadJson(dir, "asset-manifest.json") as
    | { slots?: Record<string, ManifestSlot> }
    | null;
  const slots = manifest?.slots && typeof manifest.slots === "object" ? manifest.slots : {};

  // Index gen-log rows by slot so each asset node can record its model/cost and
  // the selected-vs-rejected variant split (`ok` rows are the kept output; an
  // `error` row or a non-promoted variant path is a reject). Never throws.
  const bySlot = new Map<string, Awaited<ReturnType<typeof readGenerations>>>();
  try {
    for (const row of await readGenerations(projectId)) {
      const slot = row.input?.slot ?? row.slot;
      if (!slot) continue;
      const arr = bySlot.get(slot) ?? [];
      arr.push(row);
      bySlot.set(slot, arr);
    }
  } catch {
    /* unreadable gen-log — asset nodes still get manifest-derived facts */
  }

  const promptParents = nodes.some((n) => n.id === "prompts") ? ["prompts"] : [];
  const ids: string[] = [];

  for (const [slot, meta] of Object.entries(slots)) {
    const id = `asset:${slot}`;
    ids.push(id);
    const rows = bySlot.get(slot) ?? [];
    // The promoted variant is the manifest `path`; every other distinct output
    // local/url in the gen-log is a kept-but-rejected variant (append-only #14).
    const selected = meta.path ? [meta.path] : [];
    const rejected = Array.from(
      new Set(
        rows
          .map((r) => r.output?.local ?? r.output?.url)
          .filter((p): p is string => !!p && !selected.includes(p)),
      ),
    );
    // Cost = the manifest's recorded cost when present, else the summed gen-log cost.
    const costUsd =
      typeof meta.costUsd === "number"
        ? meta.costUsd
        : rows.reduce((s, r) => s + (r.cost_usd ?? 0), 0) || undefined;
    const lastOk = [...rows].reverse().find((r) => r.status === "ok") ?? rows[rows.length - 1];

    add({
      id,
      kind: "generated-asset",
      label: `Asset: ${slot}`,
      ref: meta.path,
      parents: promptParents,
      modelCall: {
        provider: lastOk?.provider,
        model: meta.model ?? lastOk?.model,
        costUsd,
        timestamp: meta.generatedAt ?? lastOk?.timestamp,
      },
      selectedVariants: selected,
      rejectedVariants: rejected,
    });
  }

  return ids;
}

/** Read user-assets.jsonl rows (the logged source refs), or [] on any failure. */
async function readUserAssets(
  projectId: string,
): Promise<Array<{ purpose?: string; localPath?: string; dest?: string; source?: string }>> {
  try {
    const { readLog } = await import("./gen-log.js");
    return await readLog(projectId, "user-assets");
  } catch {
    return [];
  }
}
