// The stock source connectors by id, and the default sources per kind (#596).

import { archiveConnector } from "../providers/internet-archive.js";
import { openverseConnector } from "../providers/openverse.js";
import { pexelsConnector } from "../providers/pexels.js";
import { simpleIconsConnector } from "../providers/simple-icons.js";
import { commonsConnector } from "../providers/wikimedia-commons.js";
import type { StockConnector, StockKind, StockSourceId } from "./types.js";

export const STOCK_CONNECTORS: Readonly<Record<StockSourceId, StockConnector>> = Object.freeze({
  openverse: openverseConnector,
  commons: commonsConnector,
  archive: archiveConnector,
  "simple-icons": simpleIconsConnector,
  pexels: pexelsConnector,
});

/** Sources searched when `--source` is not given, in result-interleave order. */
export const DEFAULT_STOCK_SOURCES: Readonly<Record<StockKind, readonly StockSourceId[]>> = Object.freeze({
  image: ["openverse", "commons", "pexels"],
  video: ["commons", "archive", "pexels"],
  audio: ["openverse", "commons"],
  logo: ["simple-icons", "commons"],
});

/** The source a candidate id names (its prefix), or null. */
export function stockSourceOf(candidateId: string): StockSourceId | null {
  const prefix = /^([a-z][a-z-]*):/.exec(candidateId)?.[1];
  return prefix && prefix in STOCK_CONNECTORS ? (prefix as StockSourceId) : null;
}
