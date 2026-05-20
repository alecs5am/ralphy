import { Command } from "commander";
import { addEntity, getEntity, updateEntity, deleteEntity, listEntities } from "../lib/registry.js";
import { slugify } from "../lib/ids.js";
import { out, ok, err } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";

const ARCHETYPES = [
  "student-grind",
  "it-remote",
  "courier-driver",
  "mom-blogger",
  "gen-z-energy",
  "startup-founder",
  "marketer-perf",
  "wfh-worker",
] as const;

function buildVoice(opts: any): unknown {
  if (!opts.voice) return undefined;
  if (opts.voice.includes(":")) {
    const [modelPart, voiceId] = opts.voice.includes("/")
      ? [opts.voice.split("/")[0], opts.voice.split("/").slice(1).join("/")]
      : [opts.voice, undefined];
    const [provider, model] = modelPart.split(":");
    return {
      provider: provider || "elevenlabs",
      model: model || provider,
      voiceId: voiceId || model,
      ...(opts.stability != null && { stability: opts.stability }),
      ...(opts.similarity != null && { similarityBoost: opts.similarity }),
    };
  }
  return opts.voice;
}

function buildAppearance(opts: any) {
  const a: Record<string, string> = {};
  if (opts.style) a.style = opts.style;
  if (opts.hair) a.hair = opts.hair;
  if (opts.vibe) a.vibe = opts.vibe;
  return Object.keys(a).length ? a : undefined;
}

function buildPersonality(opts: any) {
  const p: Record<string, string> = {};
  if (opts.energy) p.energy = opts.energy;
  if (opts.speakingStyle) p.speakingStyle = opts.speakingStyle;
  if (opts.credibility) p.credibility = opts.credibility;
  return Object.keys(p).length ? p : undefined;
}

function buildContext(opts: any) {
  const c: Record<string, string> = {};
  if (opts.setting) c.typicalSetting = opts.setting;
  if (opts.wardrobe) c.wardrobe = opts.wardrobe;
  if (opts.props) c.props = opts.props;
  return Object.keys(c).length ? c : undefined;
}

export function personaCmd() {
  const cmd = new Command("persona").description("Manage personas (voice + style)");

  cmd
    .command("create")
    .description("Create a new persona")
    .requiredOption("--name <name>", "Persona name")
    .option("--archetype <key>", `One of: ${ARCHETYPES.join(", ")}`)
    .option("--voice <voice>", "Voice ID (e.g. elevenlabs:eleven_multilingual_v2/<voiceId>)")
    .option("--tone <tone>", "Speaking tone (e.g. friendly, casual, deadpan)")
    .option("--language <lang>", "Language code", "en")
    .option("--age <range>", "Age range (e.g. 26-34)")
    .option("--gender <gender>", "Gender")
    .option("--stability <n>", "Voice stability 0-1", parseFloat)
    .option("--similarity <n>", "Voice similarity boost 0-1", parseFloat)
    // Appearance
    .option("--style <text>", "Appearance: clothing/style")
    .option("--hair <text>", "Appearance: hair description")
    .option("--vibe <text>", "Appearance: overall vibe")
    // Personality
    .option("--energy <text>", "Personality: energy level / pace")
    .option("--speaking-style <text>", "Personality: how they speak")
    .option("--credibility <text>", "Personality: why audience trusts them")
    // Context
    .option("--setting <text>", "Context: typical filming setting")
    .option("--wardrobe <text>", "Context: wardrobe details")
    .option("--props <text>", "Context: props in frame")
    .action(async (opts) => {
      if (opts.archetype && !ARCHETYPES.includes(opts.archetype)) {
        raiseError("E_INPUT_INVALID", { field: "archetype", detail: `must be one of: `, verb: "persona" });
      }

      const id = slugify(opts.name);
      const data: Record<string, unknown> = {
        name: opts.name,
        language: opts.language,
        createdAt: new Date().toISOString(),
      };

      if (opts.archetype) data.archetype = opts.archetype;
      if (opts.tone) data.tone = opts.tone;

      const voice = buildVoice(opts);
      if (voice) data.voice = voice;

      if (opts.age || opts.gender) {
        data.demographics = {
          ...(opts.age && { ageRange: opts.age }),
          ...(opts.gender && { gender: opts.gender }),
        };
      }

      const appearance = buildAppearance(opts);
      if (appearance) data.appearance = appearance;

      const personality = buildPersonality(opts);
      if (personality) data.personality = personality;

      const context = buildContext(opts);
      if (context) data.context = context;

      const persona = await addEntity("personas", id, data);
      ok(`Persona created: ${id}`);
      out(persona);
    });

  cmd
    .command("list")
    .description("List all personas")
    .action(async () => {
      const personas = await listEntities("personas");
      out(
        personas.map((p: any) => ({
          id: p.id,
          name: p.name,
          archetype: p.archetype || "—",
          voice: typeof p.voice === "object" ? `${p.voice.model}/${p.voice.voiceId}` : p.voice || "—",
          tone: p.tone || "—",
          language: p.language || "—",
        }))
      );
    });

  cmd
    .command("show <id>")
    .description("Show persona details")
    .action(async (id: string) => {
      const persona = await getEntity("personas", id);
      if (!persona) raiseError("E_NOT_FOUND", { kind: "Persona", id });
      out(persona);
    });

  cmd
    .command("update <id>")
    .description("Update a persona")
    .option("--name <name>")
    .option("--archetype <key>", `One of: ${ARCHETYPES.join(", ")}`)
    .option("--voice <voice>")
    .option("--tone <tone>")
    .option("--stability <n>", "", parseFloat)
    .option("--similarity <n>", "", parseFloat)
    .option("--style <text>")
    .option("--hair <text>")
    .option("--vibe <text>")
    .option("--energy <text>")
    .option("--speaking-style <text>")
    .option("--credibility <text>")
    .option("--setting <text>")
    .option("--wardrobe <text>")
    .option("--props <text>")
    .action(async (id: string, opts: any) => {
      if (opts.archetype && !ARCHETYPES.includes(opts.archetype)) {
        raiseError("E_INPUT_INVALID", { field: "archetype", detail: `must be one of: `, verb: "persona" });
      }
      const updates: Record<string, unknown> = {};
      if (opts.name) updates.name = opts.name;
      if (opts.archetype) updates.archetype = opts.archetype;
      if (opts.tone) updates.tone = opts.tone;
      const voice = buildVoice(opts);
      if (voice) updates.voice = voice;
      const appearance = buildAppearance(opts);
      if (appearance) updates.appearance = appearance;
      const personality = buildPersonality(opts);
      if (personality) updates.personality = personality;
      const context = buildContext(opts);
      if (context) updates.context = context;

      const persona = await updateEntity("personas", id, updates);
      if (!persona) raiseError("E_NOT_FOUND", { kind: "Persona", id });
      ok(`Persona updated: ${id}`);
      out(persona);
    });

  cmd
    .command("delete <id>")
    .description("Delete a persona")
    .action(async (id: string) => {
      const ok_ = await deleteEntity("personas", id);
      if (!ok_) raiseError("E_NOT_FOUND", { kind: "Persona", id });
      ok(`Persona deleted: ${id}`);
      out({ deleted: id });
    });

  return cmd;
}
