import { expect, test } from "vitest";
import { handoffRole } from "@/pages/generation";
import { requestGeneration, takeGeneration } from "@/shared/model/generation-handoff";
import type { GenerationModel } from "../shared/generation-studio";

const model = (ids: string[]): GenerationModel => ({
  id: "m", provider: "p", name: "Model", kind: "video", description: "", available: true, previewSupported: true, fields: [],
  inputs: ids.map((id) => ({ id, label: id, kind: id === "refVideos" ? "video" : "image", maxCount: 1 })),
});

test("an animated still opens the shot; anything else is a reference", () => {
  // The opening frame is what "animate this" means, and only when the model has one.
  expect(handoffRole(model(["firstFrame", "refs"]), "image", "animate")).toBe("firstFrame");
  expect(handoffRole(model(["refs"]), "image", "animate")).toBe("refs");
  expect(handoffRole(model(["firstFrame", "refs"]), "image", "reference")).toBe("refs");
  expect(handoffRole(model(["refVideos"]), "video", "reference")).toBe("refVideos");
  // A model that takes no slot of that kind takes nothing: the caller reports it rather than
  // dropping the file into whichever slot happened to come first.
  expect(handoffRole(model(["refs"]), "video", "reference")).toBeNull();
  expect(handoffRole(undefined, "image", "animate")).toBeNull();
});

test("a handed-over record is collected once", () => {
  const request = { project: { workspaceId: "w", projectId: "p" }, ref: { type: "artifact" as const, id: "a" }, label: "Hero", intent: "animate" as const };
  expect(takeGeneration()).toBeNull();
  requestGeneration(request);
  expect(takeGeneration()).toBe(request);
  // Emptied on the way out, so a later visit to Create does not re-adopt it.
  expect(takeGeneration()).toBeNull();
});
