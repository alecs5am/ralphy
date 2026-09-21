import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { marketplaceAgentRequest, projectMarketplacePublicItem } from "@/pages/marketplace";
import { AgentTaggedText, attachmentInstructions, readEntityDrop, RALPHY_ENTITY_DRAG, withAttachments } from "@/features/agent-chat";

test("an Explore reference remains attached context rather than executable draft text", () => {
  const item = projectMarketplacePublicItem({ id: "noir-grade", category: "recipe", name: "Noir", summary: "Contrast and monochrome", tags: ["film", "ffmpeg"], referenceUrls: [],
    recipe: { kind: "ffmpeg", body: "Treat the original as read-only", artifact: "ffmpeg -i input.mp4 output.mp4", parameters: null, demo: null } }, "live");
  const request = marketplaceAgentRequest(item);
  expect(request.prompt).toBe("Use “Noir” in my content.");
  expect(request.prompt).not.toContain("ffmpeg");
  expect(request.attachment).toMatchObject({ kind: "library", ref: item.key, label: "Noir" });
  expect(attachmentInstructions([request.attachment])).toContain('"tags":["film","ffmpeg"]');
  expect(attachmentInstructions([])).toBe("");
  const message = withAttachments(request.prompt, [request.attachment]);
  expect(renderToStaticMarkup(<AgentTaggedText text={message} />)).toContain("is-library");
  const dropped = readEntityDrop({ types: [RALPHY_ENTITY_DRAG], getData: () => JSON.stringify(request.attachment) });
  expect(dropped[0]).not.toHaveProperty("instructions");
});

test("large recipe artifacts stay in the library rather than exceeding the chat payload limit", () => {
  const item = projectMarketplacePublicItem({ id: "large-effect", category: "recipe", name: "Large effect", summary: "An effect", tags: ["film"], referenceUrls: [],
    recipe: { kind: "ffmpeg", body: "Instructions".repeat(5000), artifact: "filter".repeat(10000), parameters: { data: "x".repeat(60000) }, demo: null } }, "live");
  const context = marketplaceAgentRequest(item).attachment.instructions!;
  expect(context.length).toBeLessThan(2000);
  expect(JSON.parse(context.split("\n\n").at(-1)!)).toMatchObject({ source: { id: "large-effect", category: "recipe" }, tags: expect.arrayContaining(["film"]) });
  expect(JSON.parse(context.split("\n\n").at(-1)!).source).not.toHaveProperty("recipe");
});
