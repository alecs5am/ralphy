import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { studioKenneySounds } from "@/pages/marketplace/lib/studio-catalog-kenney";

const packNames = [
  "Casino Audio",
  "Sci-fi Sounds",
  "Interface Sounds",
  "Impact Sounds",
  "Voiceover Pack (Fighter)",
  "Voiceover Pack",
  "Music Jingles",
  "RPG Audio",
  "Digital Audio",
  "UI Audio",
];

test("Kenney's ten official CC0 packs ship unique browser-playable local tracks", () => {
  const sounds = studioKenneySounds();

  expect(new Set(sounds.map((sound) => sound.id)).size).toBe(sounds.length);
  expect(sounds.some((sound) => sound.name === "Preview")).toBe(false);
  expect(sounds.some((sound) => /^\d+$/.test(sound.name))).toBe(false);
  expect(sounds.some((sound) => sound.name === "Female 1")).toBe(true);
  expect(sounds.some((sound) => sound.name === "Female Final Round")).toBe(true);
  expect(sounds.some((sound) => sound.name === "Male Final Round")).toBe(true);
  expect(sounds.some((sound) => sound.name === "Voiceover Pack (Fighter) 1")).toBe(true);
  expect([...new Set(sounds.map((sound) => sound.pack?.name))].sort()).toEqual([...packNames].sort());
  for (const pack of packNames) {
    const names = sounds.filter((sound) => sound.pack?.name === pack).map((sound) => sound.name);
    expect(new Set(names).size, pack).toBe(names.length);
  }

  for (const sound of sounds) {
    expect(sound.pack?.id).toBeTruthy();
    expect(sound.pack?.publisher).toBe("Kenney");
    expect(sound.name).not.toMatch(/^Audio \/ /);
    expect(sound.name).not.toContain(" / ");
    expect(sound.mediaCredit).toBe("Kenney · CC0");
    expect(sound.reference?.url).toMatch(/^https:\/\/kenney\.nl\/assets\//);
    expect(sound.preview.kind).toBe("audio");
    expect(sound.preview.url).toContain("explore/kenney/");

    const path = resolve("public", sound.preview.url.slice(sound.preview.url.indexOf("explore/")));
    expect(existsSync(path), sound.preview.url).toBe(true);
    expect(readFileSync(path).toString("ascii", 0, 4), sound.preview.url).toBe("RIFF");
  }
});
