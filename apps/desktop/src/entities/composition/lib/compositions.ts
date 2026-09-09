import type { CompositionKind } from "../../../../electron/ralphy/types";

const byId = (left: { id: string }, right: { id: string }) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0;

export function sortCompositionRevisions<Item extends { id: string; revisionNo: number }>(items: readonly Item[]): Item[] {
  return [...items].sort((left, right) => right.revisionNo - left.revisionNo || byId(left, right));
}

export function sortBuilds<Item extends { id: string; createdAt: number }>(items: readonly Item[]): Item[] {
  return [...items].sort((left, right) => right.createdAt - left.createdAt || byId(left, right));
}

export function sortPositioned<Item extends { id: string; position: number }>(items: readonly Item[]): Item[] {
  return [...items].sort((left, right) => left.position - right.position || byId(left, right));
}

export function sortEvaluations<Item extends { id: string; createdAt: number }>(items: readonly Item[]): Item[] {
  return [...items].sort((left, right) => right.createdAt - left.createdAt || byId(left, right));
}

export function buildLabel(kind: CompositionKind): string {
  if (kind === "video") return "Render";
  if (kind === "carousel") return "Export";
  if (kind === "sticker-pack") return "Pack build";
  return "Build";
}
