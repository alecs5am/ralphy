import type {
  GenerationInputDto,
  GenerationParameterName,
  GenerationTextRole,
  JsonValue,
} from "./store/types.js";

const MAX_TEXTS = 3;
const MAX_PARAMETERS = 32;
const MAX_TEXT_BYTES = 65_536;
const TEXT_ROLES = new Set<GenerationTextRole>(["prompt", "text", "negative-prompt"]);
const PARAMETER_NAMES = new Set<GenerationParameterName>([
  "size", "durationSec", "aspectRatio", "resolution", "generateAudio", "referenceCount",
  "referenceVideoCount", "hasFirstFrame", "hasLastFrame", "hasImage", "voiceSpecified",
  "stability", "similarityBoost", "style", "speed", "speakerBoost", "forceInstrumental",
  "promptInfluence", "language", "backend",
]);

type TextInput = { role: GenerationTextRole; value: string };
type ParameterInput = { name: GenerationParameterName; value: string | number | boolean };

export function generationInput(
  texts: readonly TextInput[],
  parameters: readonly ParameterInput[],
): JsonValue {
  const dto = readGenerationInput({
    type: "generation-input/v1",
    texts: texts.map(({ role, value }) => ({ role, ...truncate(value) })),
    parameters: parameters.map(({ name, value }) => ({ name, value })),
  });
  if (!dto) throw new Error("Invalid generation input");
  return { type: "generation-input/v1", texts: dto.texts, parameters: dto.parameters };
}

export function generationParameter(
  name: GenerationParameterName,
  value: unknown,
): GenerationInputDto["parameters"][number] | null {
  if (!PARAMETER_NAMES.has(name)) return null;
  if (name === "size") {
    const size = normalizeSize(value);
    return size ? { name, value: size } : null;
  }
  if (name === "aspectRatio") return validString(value, /^[1-9]\d?:[1-9]\d?$/) ? { name, value } : null;
  if (name === "resolution") return validString(value, /^(?:[1-9]\d{2,3}p|[248]K)$/) ? { name, value } : null;
  if (name === "language") return value === "ru" || value === "en" || value === "auto" ? { name, value } : null;
  if (name === "backend") return value === "elevenlabs" || value === "openrouter" || value === "gemini" ? { name, value } : null;
  if (["durationSec", "referenceCount", "referenceVideoCount", "stability", "similarityBoost", "style", "speed", "promptInfluence"].includes(name)) {
    return typeof value === "number" && Number.isFinite(value) ? { name, value } : null;
  }
  return typeof value === "boolean" ? { name, value } : null;
}

export function readGenerationInput(value: unknown): GenerationInputDto | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["type", "texts", "parameters"])
    || value.type !== "generation-input/v1" || !Array.isArray(value.texts)
    || !Array.isArray(value.parameters) || value.texts.length > MAX_TEXTS
    || value.parameters.length > MAX_PARAMETERS) return null;

  const roles = new Set<GenerationTextRole>();
  const texts: GenerationInputDto["texts"] = [];
  for (const text of value.texts) {
    if (!isRecord(text) || !hasOnlyKeys(text, ["role", "value", "truncated"])
      || !TEXT_ROLES.has(text.role as GenerationTextRole) || typeof text.value !== "string"
      || typeof text.truncated !== "boolean" || Buffer.byteLength(text.value, "utf8") > MAX_TEXT_BYTES
      || roles.has(text.role as GenerationTextRole)) return null;
    roles.add(text.role as GenerationTextRole);
    texts.push({ role: text.role as GenerationTextRole, value: text.value, truncated: text.truncated });
  }

  const names = new Set<GenerationParameterName>();
  const parameters: GenerationInputDto["parameters"] = [];
  for (const parameter of value.parameters) {
    if (!isRecord(parameter) || !hasOnlyKeys(parameter, ["name", "value"])
      || typeof parameter.name !== "string" || names.has(parameter.name as GenerationParameterName)) return null;
    const safe = generationParameter(parameter.name as GenerationParameterName, parameter.value);
    if (!safe) return null;
    names.add(safe.name);
    parameters.push(safe);
  }
  return { version: 1, texts, parameters };
}

function truncate(value: string): { value: string; truncated: boolean } {
  if (Buffer.byteLength(value, "utf8") <= MAX_TEXT_BYTES) return { value, truncated: false };
  let bytes = Buffer.from(value).subarray(0, MAX_TEXT_BYTES);
  let result = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  while (!Buffer.from(result).equals(bytes)) {
    bytes = bytes.subarray(0, bytes.length - 1);
    result = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
  return { value: result, truncated: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validString(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && value.length <= 32 && pattern.test(value);
}

function normalizeSize(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 32) return null;
  const match = value.match(/^(\d+)\s*x\s*(\d+)$/i);
  if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) return null;
  return `${Number(match[1])}x${Number(match[2])}`;
}
