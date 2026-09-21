import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { studioRemocnMotion } from "@/pages/marketplace/lib/studio-catalog-remocn-motion";

const expectedGroups = {
  transitions: 26,
  effects: 9,
  shaders: 23,
  filters: 10,
  social: 5,
  compositions: 3,
  ai: 5,
  craft: 4,
  templates: 5,
};
const upstreamCommit = "3903a46b3438da48c8c63083f0d1222ab814dde2";

test("bundles every eligible Remocn motion reference with copied source and a local preview", () => {
  const entries = studioRemocnMotion();

  // The upstream `guides` group is documentation prose, not components, so it is not a Visuals entry.
  expect(entries.some((entry) => entry.tags.includes("guides"))).toBe(false);

  expect(entries).toHaveLength(90);
  expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  expect(new Set(entries.map((entry) => entry.preview.url)).size).toBe(entries.length);
  expect(readFileSync(resolve("public/explore/remocn/motion/LICENSE"), "utf8")).toContain("MIT License");

  for (const [group, count] of Object.entries(expectedGroups)) {
    const grouped = entries.filter((entry) => entry.tags.includes(`remocn:${group}`));
    expect(grouped).toHaveLength(count);
    expect(grouped.every((entry) => entry.artifact?.includes(`data-remocn-adapter=\"${group}\"`))).toBe(true);
  }

  for (const entry of entries) {
    expect(entry.remocnVisual).toMatchObject({ id: entry.id, group: expect.any(String), scene: expect.any(String) });
    expect(entry.settings).toMatchObject({ speed: 1, format: "portrait", title: entry.name });
    expect(entry.mediaCredit).toBe("Remocn · MIT");
    expect(entry.reference?.url).toMatch(new RegExp(`^https://github\\.com/Remocn/remocn/blob/${upstreamCommit}/`));
    expect(entry.artifact).toContain("Source:");
    expect(entry.artifact).toContain("<!doctype html>");
    expect(entry.artifact).toContain("gsap.timeline");
    expect(entry.artifact).toContain("window.gsap");
    expect(entry.artifact).toContain(".animate(");
    expect(entry.artifact).toContain(`data-remocn-id=\"${entry.id}\"`);
    expect(entry.artifact).toContain("/explore/remocn/motion/LICENSE");
    expect(entry.artifact!.trim()).toMatch(/<\/html>$/);
    expect(entry.artifact!.length).toBeGreaterThan(180);
    expect(entry.body).toContain("HyperFrames HTML/CSS/GSAP");
    expect(entry.tags).toContain("remocn");
    const previewPath = resolve("public", entry.preview.url.slice(entry.preview.url.indexOf("explore/")));
    expect(existsSync(previewPath)).toBe(true);
    expect(readFileSync(previewPath, "utf8")).toContain(entry.id);
    expect(entry.format).not.toMatch(/^Remocn (?:a|craf|socia)$/);
  }
});
