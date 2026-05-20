// Template loader (02.05.01). Reads `template.yaml` (preferred) or falls
// back to the legacy `template.json` shape for backwards-compatibility during
// the 02.05.04 migration window. Either way, the parsed value is validated
// against `TemplateYamlSchema`; unsupported `version` values raise
// `E_TEMPLATE_VERSION_UNSUPPORTED`.
//
// References:
//   roadmap/02-prompts-and-templates/SPEC.md#02-05
//   roadmap/02-prompts-and-templates/OPEN-QUESTIONS.md#d-03

import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import {
  TemplateYamlSchema,
  isSupportedVersion,
  type TemplateYaml,
} from "../schemas/template.js";
import { raiseError } from "../errors/index.js";

/**
 * Locate a template's manifest file in a directory. Prefers `template.yaml`,
 * falls back to `template.json` for not-yet-migrated templates.
 */
export async function locateTemplateManifest(dir: string): Promise<{ path: string; format: "yaml" | "json" } | null> {
  const yamlPath = path.join(dir, "template.yaml");
  const jsonPath = path.join(dir, "template.json");
  try {
    await fs.access(yamlPath);
    return { path: yamlPath, format: "yaml" };
  } catch { /* fall through */ }
  try {
    await fs.access(jsonPath);
    return { path: jsonPath, format: "json" };
  } catch { /* missing */ }
  return null;
}

/**
 * Parse a manifest from raw text. Throws (`Error` or — when the version field
 * is unrecognized — calls `raiseError("E_TEMPLATE_VERSION_UNSUPPORTED")` which
 * exits the process). Returns the validated `TemplateYaml` on success.
 *
 * Callers that need to handle the version error without process exit should
 * pre-check the version field themselves before calling this function.
 */
export function parseTemplateManifest(raw: string, format: "yaml" | "json", id: string): TemplateYaml {
  const value = format === "yaml" ? YAML.parse(raw) : JSON.parse(raw);
  if (!value || typeof value !== "object") {
    throw new Error(`template manifest must be an object (got ${typeof value})`);
  }
  const versionField = (value as Record<string, unknown>).version;
  if (!isSupportedVersion(versionField)) {
    // Path: `version:` is missing or set to a value the loader doesn't know.
    // We surface the offender via the structured error code so agents can
    // pattern-match on it without parsing the human message.
    raiseError("E_TEMPLATE_VERSION_UNSUPPORTED", {
      version: String(versionField),
      id,
    });
  }
  return TemplateYamlSchema.parse(value);
}

/**
 * Load + validate the template manifest from `dir`. Returns null if neither
 * `template.yaml` nor `template.json` is present. Throws on parse / version
 * failures.
 */
export async function loadTemplateManifest(dir: string, idHint?: string): Promise<TemplateYaml | null> {
  const located = await locateTemplateManifest(dir);
  if (!located) return null;
  const raw = await fs.readFile(located.path, "utf-8");
  const id = idHint ?? path.basename(dir);
  return parseTemplateManifest(raw, located.format, id);
}

/**
 * Diagnose what's missing from a template's `requires` block given the
 * resolved inputs. Returns the first missing requirement as a kind hint
 * (e.g. "brand", "persona", "ref"). `null` means everything required is
 * satisfied. Callers map this onto `E_TEMPLATE_INPUT_MISSING`.
 */
export function diagnoseRequiredInputs(
  template: TemplateYaml,
  inputs: { brand?: string; persona?: string; refCount?: number },
): { requirement: string } | null {
  const req = template.requires;
  if (req.brand && !inputs.brand) return { requirement: "brand" };
  if (req.persona && !inputs.persona) return { requirement: "persona" };
  if (typeof req.refs === "number" && req.refs > 0) {
    const have = inputs.refCount ?? 0;
    if (have < req.refs) return { requirement: `ref (need ${req.refs}, have ${have})` };
  }
  return null;
}
