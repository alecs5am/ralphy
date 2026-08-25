import { createHash } from "node:crypto";
import type { DomainIdPrefix } from "../store/ids.js";

export function migrationStableId(prefix: DomainIdPrefix, runId: string, key: string): string {
  const hex = createHash("sha256").update(`${runId}\0${key}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = "8";
  const value = hex.join("");
  return `${prefix}_${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
