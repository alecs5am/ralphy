import packs from "./generated/kenney-audio-catalog.generated.json";
import type { StudioEntry } from "./studio-catalog";

const asset = (path: string) => `${import.meta.env.BASE_URL}explore/kenney/${path}`;
const trackName = (packName: string, path: string) => {
  const parts = path.split(" / ");
  const name = parts.at(-1) ?? path;
  const group = parts.at(-2);
  if (group && /^(?:female|male)$/i.test(group)) return `${group} ${name}`;
  if (!/^\d+$/.test(name)) return name;
  return `${group && group !== "Audio" ? group : packName} ${name}`;
};

/** CC0 audio copied from Kenney's official package archives at build time. */
export function studioKenneySounds(): StudioEntry[] {
  return packs.flatMap((pack) => pack.tracks.filter((track) => track.name !== "Preview").map((track) => ({
    id: `kenney-${track.id}`,
    name: trackName(pack.name, track.name),
    summary: `${pack.name} audio from Kenney's CC0 collection.`,
    tags: ["audio", "kenney", "cc0", pack.id],
    duration: "Bundled WAV",
    format: "Kenney CC0 audio",
    pack: { id: pack.id, name: pack.name, publisher: "Kenney" },
    mediaCredit: "Kenney · CC0",
    reference: { title: `${pack.name} on Kenney`, url: pack.sourceUrl },
    preview: { kind: "audio", url: asset(track.file), posterUrl: asset(pack.cover) },
    body: `Use this local WAV from Kenney's official ${pack.name} CC0 pack. Trim it intentionally, leave narration intelligible, and retain the original source when creating a mixed revision.`,
    artifact: `Source: ${pack.sourceUrl}\nLicense: CC0 1.0\nPublisher: Kenney\nPack: ${pack.name}`,
  })));
}
