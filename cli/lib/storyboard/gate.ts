// Storyboard approval gate (#570).
//
// In AI production, paid image and video generation for a scene waits for the
// user's storyboard approval. `ralphy generate image | image-batch | video`
// call `enforceStoryboardGate` with the slots they are about to spend on:
//   • a slot that does not name a scene (`scene-NN-…`), a storyboard frame slot
//     (`storyboard-scene-NN`, `scene-NN-storyboard`, `scene-NN-sketch`), a
//     Workspace destination, a host import and a raw-footage project all pass;
//   • a scene slot whose scene is approved on its CURRENT content passes;
//   • anything else — pending, rejected, stale (content changed after the
//     approval), or a scene the storyboard does not know — warns on stderr and
//     refuses with E_GATE_STORYBOARD, unless the user passed the explicit
//     override `--no-storyboard-consent "<reason>"`, which is logged to the
//     Project's user-prompt log as `stage: no-storyboard-consent`.
// Dry runs spend nothing: they warn and continue.

import { existsSync } from "node:fs";
import path from "node:path";
import { raiseError } from "../errors/index.js";
import { logUserPromptInDir } from "../gen-log.js";
import { ralphDir } from "../paths.js";
import { sceneOfSlot, type StoryboardSceneState } from "./model.js";
import { showStoryboard } from "./record.js";
import { findStoryboardProject } from "./source.js";

export interface StoryboardGateBlock {
  slot: string;
  scene: string;
  state: StoryboardSceneState | "unknown";
}

export interface StoryboardGateVerdict {
  /** False when the gate does not apply (no store, no Project, raw footage, no scene slots). */
  applies: boolean;
  allowed: boolean;
  blocked: StoryboardGateBlock[];
  reason: string;
  projectDir: string | null;
}

/** Evaluate the gate for the slots a generate call is about to spend on. Reads only. */
export function checkStoryboardGate(projectReference: string, slots: string[]): StoryboardGateVerdict {
  const pass = (reason: string): StoryboardGateVerdict => ({ applies: false, allowed: true, blocked: [], reason, projectDir: null });
  const sceneSlots = slots
    .map((slot) => ({ slot, scene: sceneOfSlot(slot) }))
    .filter((entry): entry is { slot: string; scene: string } => entry.scene !== null);
  if (sceneSlots.length === 0) return pass("no scene slot in this call");
  if (!existsSync(path.join(ralphDir(), "ralphy.db"))) return pass("no domain store: approvals cannot be recorded");
  const project = findStoryboardProject(projectReference);
  if (!project) return pass(`project ${projectReference} is not in the store`);
  const view = showStoryboard(project);
  if (!view.aiProduction) return pass(view.aiProductionReason);
  const states = new Map(view.scenes.map((scene) => [scene.id, scene.state]));
  const blocked = sceneSlots
    .map(({ slot, scene }) => ({ slot, scene, state: states.get(scene) ?? "unknown" as const }))
    .filter((entry) => entry.state !== "approved");
  return {
    applies: true,
    allowed: blocked.length === 0,
    blocked,
    reason: blocked.length === 0 ? "every scene in this call is approved" : describeBlocks(blocked),
    projectDir: project.dir,
  };
}

/**
 * Enforce the gate. Returns normally when the call may proceed; raises
 * E_GATE_STORYBOARD otherwise. `consent` is the `--no-storyboard-consent`
 * reason (or null); `dryRun` warns without refusing.
 */
export async function enforceStoryboardGate(input: {
  project: string | undefined;
  slots: string[];
  consent: string | null;
  dryRun?: boolean;
  verb: string;
}): Promise<StoryboardGateVerdict | null> {
  if (!input.project) return null;
  const verdict = checkStoryboardGate(input.project, input.slots);
  if (verdict.allowed) return verdict;
  const show = `ralphy storyboard show ${input.project}`;
  // eslint-disable-next-line no-console
  console.error(`[warn] storyboard gate: ${verdict.reason}. Review with \`${show}\` (or \`ralphy storyboard html ${input.project}\`) and approve before paid generation.`);
  if (input.dryRun) return verdict;
  if (input.consent) {
    await logUserPromptInDir(verdict.projectDir!, {
      stage: "no-storyboard-consent",
      text: input.consent,
      note: `${input.verb} slots=${verdict.blocked.map((entry) => entry.slot).join(",")} | ${verdict.reason}`,
    });
    // eslint-disable-next-line no-console
    console.error("[warn] storyboard gate bypassed (--no-storyboard-consent); the override is logged.");
    return verdict;
  }
  raiseError("E_GATE_STORYBOARD", {
    slot: verdict.blocked.map((entry) => entry.slot).join(", "),
    detail: verdict.reason,
    project: input.project,
  });
}

/** Normalize the commander `--no-storyboard-consent <reason>` value. */
export function readStoryboardConsent(opts: { storyboardConsent?: unknown }): string | null {
  const value = opts.storyboardConsent;
  if (typeof value !== "string") return null;
  const reason = value.trim();
  return reason.length > 0 ? reason : null;
}

function describeBlocks(blocked: StoryboardGateBlock[]): string {
  return blocked
    .map(({ scene, state }) => `${scene} is ${state === "unknown" ? "not in the storyboard" : state === "stale" ? "stale (changed after approval)" : state}`)
    .join("; ");
}
