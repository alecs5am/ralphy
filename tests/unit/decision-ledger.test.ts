// Decision ledger (#558) — deterministic derivation from synthetic fixture
// project files, the hook classifier, manual --set parsing, and append-only
// persistence as a JSON Document in the domain store. No model calls.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import {
  classifyHookText,
  deriveDecisions,
  effectiveDecisions,
  gatherFileSources,
  gatherLedgerSources,
  normalizeAspect,
  parseLedgerAssignment,
  previewLedger,
  readStoredLedger,
  writeLedger,
} from "../../cli/lib/analytics/ledger";
import { MetricParseError } from "../../cli/lib/analytics/metric-parse";
import { closeDomainDb } from "../../cli/lib/store/db";
import { createDocument, listDocumentRevisions, reviseDocument } from "../../cli/lib/store/documents";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes";
import { createUnitWithRevision } from "../../cli/lib/store/units";
import { listUnitOutcomeFacts, locateUnits } from "../../cli/lib/store/outcomes";
import { verifyDomainStore } from "../../cli/lib/store/verify";

const FIXTURE = path.resolve(import.meta.dir, "../fixtures/decision-ledger/project-a");

describe("deriveDecisions from fixture project files", () => {
  test("every field comes from an artifact and names its source", () => {
    const gathered = gatherFileSources(FIXTURE, "coffee-hero");
    const derived = deriveDecisions(gathered.sources);
    const values = Object.fromEntries(Object.entries(derived).map(([key, entry]) => [key, entry.value]));
    expect(values).toEqual({
      format: "video",
      template: "review-general",
      style: "warm-kitchen",
      content_mode: "ugc-review",
      hook_type: "listicle",
      angle: "comparison",
      structure: "hook-body-cta",
      scene_count: 4,
      transitions: ["crossfade", "glitch", "whip-pan"],
      motion_elements: ["kinetic-title", "lower-third", "lower-third-banner", "progress-bar"],
      caption_preset: "bold karaoke",
      layout: "split-top-bottom",
      aspect: "9:16",
      models: ["elevenlabs/eleven-v3", "google/gemini-3-pro-image-preview", "kwaivgi/kling-v3.0-pro"],
      duration_sec: 23.6,
      length_band: "medium",
      variant_axis: "hook",
    });
    expect(derived.format!.source).toBe("project:units/coffee-hero/unit.json#format");
    expect(derived.content_mode!.source).toBe("project:production-plan.json#contentMode.mode");
    expect(derived.hook_type!.source).toBe("project:scenario.json#hook text (heuristic)");
    expect(derived.models!.source).toContain("project:logs/generations.jsonl");
    expect(derived.duration_sec!.source).toBe("project:scenario.json#duration");
    expect(gathered.derivedFrom).toEqual(expect.arrayContaining([
      "project:production-plan.json",
      "project:scenario.json",
      "project:prompts.json",
      "project:asset-manifest.json",
      "project:units/coffee-hero/unit.json",
      "project:logs/generations.jsonl",
      "project:index.html",
      "project:compositions/",
    ]));
  });

  test("failed generations, local tools, and text models are not production models", () => {
    const derived = deriveDecisions(gatherFileSources(FIXTURE).sources);
    const models = derived.models!.value as string[];
    expect(models).not.toContain("bytedance/seedance-2.0");
    expect(models).not.toContain("hyperframes-snapshot");
    expect(models).not.toContain("hyperframes-render");
    expect(models).not.toContain("anthropic/claude-sonnet-4.6");
  });

  test("precedence: store unit, campaign selection, then plan; planned models are labelled", () => {
    const derived = deriveDecisions({
      unit: { format: "carousel" },
      unitManifest: { format: "video", provenance: { selection: { hookType: "Question" } } },
      plan: {
        formatTemplate: { format: "image" },
        durationSec: 45,
        modelStack: [{ model: "openai/gpt-5.4-image-2" }, { model: "elevenlabs-tts" }],
      },
      scenario: { hook: { vo: "POV: you finally fixed the kettle" } },
    });
    expect(derived.format).toEqual({ value: "carousel", source: "store:unit#format" });
    expect(derived.hook_type!.value).toBe("question");
    expect(derived.length_band!.value).toBe("long");
    expect(derived.models).toEqual({
      value: ["elevenlabs-tts", "openai/gpt-5.4-image-2"],
      source: "project:production-plan.json#modelStack (planned, not observed)",
    });
  });

  test("an empty project yields an empty ledger, not guesses", () => {
    expect(deriveDecisions({})).toEqual({});
  });
});

describe("hook classifier and value normalization", () => {
  test.each([
    ["POV: your kettle finally pours straight", "pov"],
    ["Stop buying cheap kettles", "warning"],
    ["The one mistake every home barista makes", "warning"],
    ["How to brew pour-over in two minutes", "how-to"],
    ["Five reasons this kettle wins", "listicle"],
    ["Why does your coffee taste bitter?", "question"],
    ["I tested six kettles for a month", "story"],
    ["Nobody talks about the spout angle", "curiosity"],
    ["This kettle is matte black and quiet.", "statement"],
  ])("%s → %s", (line, expected) => {
    expect(classifyHookText(line)).toBe(expected);
  });

  test("empty hook text is unclassified", () => {
    expect(classifyHookText("   ")).toBeNull();
  });

  test("aspect ratios normalize to W:H", () => {
    expect(normalizeAspect("1080 / 1920")).toBe("9:16");
    expect(normalizeAspect("1920x1080")).toBe("16:9");
    expect(normalizeAspect("9:16")).toBe("9:16");
    expect(normalizeAspect("portrait")).toBeNull();
  });

  test("--set parses labels, sets, numbers, and explicit none", () => {
    expect(parseLedgerAssignment("hook-type=Question")).toEqual({ key: "hook_type", value: "question" });
    expect(parseLedgerAssignment("transitions=whip-pan, Crossfade,whip-pan")).toEqual({
      key: "transitions",
      value: ["crossfade", "whip-pan"],
    });
    expect(parseLedgerAssignment("duration_sec=0:31")).toEqual({ key: "duration_sec", value: 31 });
    expect(parseLedgerAssignment("scene_count=6")).toEqual({ key: "scene_count", value: 6 });
    expect(parseLedgerAssignment("models=Google/Gemini-3-Pro-Image-Preview")).toEqual({
      key: "models",
      value: ["google/gemini-3-pro-image-preview"],
    });
    expect(parseLedgerAssignment("aspect=1080x1920")).toEqual({ key: "aspect", value: "9:16" });
    expect(parseLedgerAssignment("music_bed=lofi")).toEqual({ key: "music_bed", value: "lofi" });
    expect(parseLedgerAssignment("layout=")).toEqual({ key: "layout", value: null });
    expect(() => parseLedgerAssignment("no-equals-sign")).toThrow(MetricParseError);
    expect(() => parseLedgerAssignment("scene_count=2.5")).toThrow(MetricParseError);
    expect(() => parseLedgerAssignment("9bad=x")).toThrow(MetricParseError);
  });

  test("manual entries win, null suppresses, length band follows the duration", () => {
    const derived = deriveDecisions(gatherFileSources(FIXTURE, "coffee-hero").sources);
    const effective = effectiveDecisions(derived, { hook_type: "question", layout: null, duration_sec: 12 });
    expect(effective.hook_type).toBe("question");
    expect(effective.layout).toBeUndefined();
    expect(effective.duration_sec).toBe(12);
    expect(effective.length_band).toBe("short");
  });
});

describe("decision ledger persistence", () => {
  let tmp: TmpRoot;

  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-decision-ledger-558");
  });

  afterEach(() => {
    closeDomainDb();
    tmp.cleanup();
  });

  function seedUnit() {
    const workspace = createWorkspace({ slug: "kettle-brand", name: "Kettle brand" });
    const project = createProject({ workspaceId: workspace.id, slug: "coffee-review-001", name: "Coffee review" });
    const document = createDocument({ projectId: project.id, kind: "note", slug: "script", title: "Script" });
    const body = reviseDocument({ documentId: document.id, expectedHeadId: null, format: "markdown", body: "# Kettle" });
    createUnitWithRevision({
      projectId: project.id,
      slug: "coffee-hero",
      format: "video",
      items: [{ documentRevisionId: body.id, role: "body", position: 0 }],
    });
    const context = { workspaceId: workspace.id };
    const [location] = locateUnits({ context, ref: "coffee-hero" });
    return { context: { workspaceId: workspace.id, projectId: project.id }, location: location!, workspaceId: workspace.id };
  }

  test("store sources come first; --from files fill the rest", () => {
    const { context, location } = seedUnit();
    const gathered = gatherLedgerSources(context, location, FIXTURE);
    expect(gathered.projectDirectory).toBe(FIXTURE);
    const derived = deriveDecisions(gathered.sources);
    expect(derived.format).toEqual({ value: "video", source: "store:unit#format" });
    expect(derived.template!.value).toBe("review-general");
    expect(gathered.derivedFrom[0]).toBe("store:unit");
  });

  test("writes an append-only JSON Document; identical content is a no-op", () => {
    const { context, location, workspaceId } = seedUnit();
    const preview = previewLedger(context, location, FIXTURE);
    expect(preview.stored).toBeNull();
    const first = writeLedger({ context, location, derived: preview.derived, manual: {}, derivedFrom: preview.derivedFrom });
    expect(first.written).toBe(true);
    const again = writeLedger({ context, location, derived: preview.derived, manual: {}, derivedFrom: preview.derivedFrom });
    expect(again.written).toBe(false);
    expect(again.revisionId).toBe(first.revisionId);

    const manual = writeLedger({
      context,
      location,
      derived: preview.derived,
      manual: { hook_type: "question", music_bed: "lofi" },
      derivedFrom: preview.derivedFrom,
    });
    expect(manual.written).toBe(true);
    expect(manual.documentId).toBe(first.documentId);
    const revisions = listDocumentRevisions({ context, documentId: first.documentId, limit: 10 }).items;
    expect(revisions).toHaveLength(2);
    expect(revisions.every((revision) => revision.format === "json")).toBe(true);

    const stored = readStoredLedger(context, location.unitId);
    expect(stored?.body?.manual).toEqual({ hook_type: "question", music_bed: "lofi" });
    const facts = listUnitOutcomeFacts({ context: { workspaceId } });
    expect(facts[0]!.ledger?.documentId).toBe(first.documentId);
    expect(verifyDomainStore().integrity).toBe("ok");
  });
});
