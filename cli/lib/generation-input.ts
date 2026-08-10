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
      || !PARAMETER_NAMES.has(parameter.name as GenerationParameterName)
      || !isParameterValue(parameter.value) || names.has(parameter.name as GenerationParameterName)) return null;
    names.add(parameter.name as GenerationParameterName);
    parameters.push({
      name: parameter.name as GenerationParameterName,
      value: parameter.value,
    });
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

function isParameterValue(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value));
}
