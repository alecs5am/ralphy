import { openDomainDb } from "../../cli/lib/store/db.js";
import {
  getObjectRow,
  resolveObjectPath,
} from "../../cli/lib/store/internal-objects.js";

export function storedObjectPath(id: string): string {
  const row = getObjectRow(openDomainDb(), id);
  if (!row) throw new Error(`Object not found: ${id}`);
  return resolveObjectPath(row);
}
