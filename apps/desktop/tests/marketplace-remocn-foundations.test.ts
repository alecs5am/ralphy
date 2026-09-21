import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { studioRemocnFoundations } from "@/pages/marketplace/lib/studio-catalog-remocn-foundations";

test("Remocn foundations retain local MIT references for every imported group", () => {
  const entries = studioRemocnFoundations();

  expect(entries).toHaveLength(118);
  expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  expect(Object.fromEntries(["typography", "layout", "ui", "ui-blocks"].map((group) => [group, entries.filter((entry) => entry.tags.includes(group)).length]))).toEqual({ typography: 61, layout: 4, ui: 42, "ui-blocks": 11 });
  expect(new Set(entries.map((entry) => entry.preview.url)).size).toBe(entries.length);
  expect(new Set(entries.map((entry) => entry.artifact)).size).toBe(entries.length);
  expect(readFileSync(resolve("src/pages/marketplace/lib/generated/remocn-foundations.MIT.txt"), "utf8")).toContain("MIT License");

  for (const entry of entries) {
    expect(entry.remocnVisual).toMatchObject({ id: entry.id, group: expect.any(String), scene: expect.any(String) });
    expect(entry.settings).toMatchObject({ speed: 1, format: "portrait", title: entry.name });
    expect(entry.mediaCredit).toBe("Remocn · MIT");
    expect(entry.reference?.url).toMatch(/^https:\/\/github\.com\/Remocn\/remocn\/blob\/[a-f0-9]{40}\//);
    expect(entry.artifact).toMatch(/^<!doctype html>/i);
    expect(entry.artifact).toContain('id="remocn-source"');
    expect(entry.artifact).toContain("window.gsap");
    expect(entry.artifact).toContain("MIT License");
    expect(entry.body).toContain("HyperFrames HTML/CSS/GSAP");
    expect(Object.keys(entry.settings ?? {}).length).toBeGreaterThan(0);
    expect(entry.preview.url).toMatch(/explore\/remocn\/foundations\/.+\.svg$/);
    expect(existsSync(resolve("public", entry.preview.url.slice(entry.preview.url.indexOf("explore/"))))).toBe(true);
  }
});
