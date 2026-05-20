// Reference-required classifier (04.02.02).
//
// The reference-required gate (AGENTS.md hard invariant #3) fires ONLY when a
// brief / scenario / prompt names a specific real-world entity that the model
// cannot fabricate plausibly from text alone. Three buckets:
//
//   • "person"        — a named real human (e.g. "Elon Musk", "Beyonce",
//                       "@mrbeast"). Generic role labels ("a barista",
//                       "the founder") do NOT trigger.
//   • "brand-product" — a recognizable brand product / packaging / logo
//                       (e.g. "Coca-Cola can", "iPhone 16", "Old Spice
//                       bottle"). Generic product nouns ("a pastry", "a
//                       workout app") do NOT trigger.
//   • "ip"            — a recognizable IP / character / franchise (e.g.
//                       "Mickey Mouse", "Pikachu", "Marvel logo").
//
// This is a fast, deterministic, offline classifier — it intentionally errs
// on the side of FALSE NEGATIVES (will miss novel proper nouns) rather than
// false positives (will not refuse generic product ads).
//
// The full LLM-based gate is left to the agent during intake; this module is
// the floor that the CLI uses to surface a verb-level check.

/** Coarse classification of why a reference is required. */
export type RefGateKind = "person" | "brand-product" | "ip";

/** Result of the classifier. */
export interface RefGateResult {
  required: boolean;
  /** Free-form reason; present only when required. */
  reason?: string;
  /** Bucket the matched entity falls into. */
  kind?: RefGateKind;
  /** The matched span(s) from the input text, for surface-area in errors. */
  matches?: string[];
}

/** Input we can classify — accepts a scenario-shaped object or raw text. */
export type ScenarioLike =
  | string
  | {
      /** Top-level title / brief. */
      name?: string;
      /** Free-form description / brief. */
      description?: string;
      /** Brand name on scenario root (e.g. "Old Spice"). */
      brand?: string;
      /** Persona block with a name. Generic archetypes ("it-remote") do not trigger. */
      character?: { name?: string; role?: string; description?: string };
      persona?: { name?: string; role?: string; description?: string };
      /** Scenes carry the highest-density prompt text. */
      scenes?: Array<{
        keyframe_prompt_brief?: string;
        motion_prompt?: string;
        voEn?: string;
        voRu?: string;
        notes?: string;
      }>;
      /** Any other free-form blob — concatenated before scan. */
      [k: string]: unknown;
    };

// ── Lexicons ───────────────────────────────────────────────────────────────
//
// We deliberately keep these short and famous. The goal is "catch the obvious
// 80%", not "be a complete name database". Adding fringe names here is a
// defect — it bloats false positives without helping real users.

const KNOWN_PEOPLE: RegExp[] = [
  // Tech figureheads
  /\bElon\s+Musk\b/i,
  /\bMark\s+Zuckerberg\b/i,
  /\bSteve\s+Jobs\b/i,
  /\bBill\s+Gates\b/i,
  /\bJeff\s+Bezos\b/i,
  /\bSatya\s+Nadella\b/i,
  /\bSundar\s+Pichai\b/i,
  /\bSam\s+Altman\b/i,
  /\bJensen\s+Huang\b/i,
  // Politics
  /\bDonald\s+Trump\b/i,
  /\bJoe\s+Biden\b/i,
  /\bBarack\s+Obama\b/i,
  /\bVladimir\s+Putin\b/i,
  // Entertainment / sports
  /\bTaylor\s+Swift\b/i,
  /Beyonc[eé]/iu,
  /\bKanye\s+West\b/i,
  /\bLionel\s+Messi\b/i,
  /\bCristiano\s+Ronaldo\b/i,
  /\bLeBron\s+James\b/i,
  /\bKim\s+Kardashian\b/i,
  /\bMrBeast\b/i,
  /\bDwayne\s+Johnson\b/i,
];

const KNOWN_BRANDS: RegExp[] = [
  // Soft drinks
  /\bCoca[\s-]?Cola\b/i,
  /\bCoke\b/i, // standalone "coke" — common enough to trigger
  /\bPepsi\b/i,
  /\bSprite\b/i,
  /\bDr\.?\s+Pepper\b/i,
  /\bRed\s+Bull\b/i,
  /\bMonster\s+Energy\b/i,
  // Coffee chains
  /\bStarbucks\b/i,
  /\bDunkin'?\b/i,
  // Fast food
  /\bMcDonald'?s\b/i,
  /\bBurger\s+King\b/i,
  /\bKFC\b/i,
  /\bTaco\s+Bell\b/i,
  /\bSubway\s+sandwich\b/i,
  /\bChipotle\b/i,
  // Tech products / brands
  /\biPhone(?:\s*\d+(?:\s*(?:Pro|Plus|mini|Max))?)?\b/i,
  /\biPad\b/i,
  /\bMacBook\b/i,
  /\bAirPods\b/i,
  /\bApple\s+Watch\b/i,
  /\bGalaxy\s+S\d+\b/i,
  /\bGalaxy\s+Note\b/i,
  /\bPixel\s+\d+\b/i,
  /\bPlayStation\s*\d?\b/i,
  /\bPS\s?[45]\b/i,
  /\bXbox(?:\s+(?:Series\s+[SX]|One))?\b/i,
  /\bNintendo\s+Switch\b/i,
  /\bSteam\s+Deck\b/i,
  // Fashion / cosmetics
  /\bNike\b/i,
  /\bAdidas\b/i,
  /\bGucci\b/i,
  /\bLouis\s+Vuitton\b/i,
  /\bChanel\b/i,
  /\bRolex\b/i,
  /\bOld\s+Spice\b/i,
  /\bAxe\s+body\s+(?:spray|wash)\b/i,
  // Cars
  /\bTesla\s+(?:Model|Cybertruck)/i,
  /\bFerrari\b/i,
  /\bLamborghini\b/i,
  /\bPorsche\b/i,
  /\bBMW\s+M\d/i,
];

const KNOWN_IP: RegExp[] = [
  // Disney
  /\bMickey\s+Mouse\b/i,
  /\bDonald\s+Duck\b/i,
  /\bElsa\s+(?:from\s+)?Frozen\b/i,
  // Pokemon
  /\bPikachu\b/i,
  /\bPok[eé]mon\b/i,
  // Star Wars
  /\bDarth\s+Vader\b/i,
  /\bBaby\s+Yoda\b/i,
  /\bGrogu\b/i,
  /\bLuke\s+Skywalker\b/i,
  // Marvel / DC
  /\bSpider[\s-]?Man\b/i,
  /\bIron\s+Man\b/i,
  /\bBatman\b/i,
  /\bSuperman\b/i,
  /\bWonder\s+Woman\b/i,
  /\bDeadpool\b/i,
  // Anime
  /\bGoku\b/i,
  /\bNaruto\b/i,
  /\bSailor\s+Moon\b/i,
  // Mascots
  /\bRonald\s+McDonald\b/i,
  /\bColonel\s+Sanders\b/i,
];

/** Generic archetypes that explicitly do NOT trigger the gate. */
const GENERIC_ARCHETYPE_TOKENS = new Set([
  "barista",
  "founder",
  "ceo",
  "engineer",
  "teacher",
  "student",
  "courier",
  "doctor",
  "nurse",
  "athlete",
  "musician",
  "chef",
  "it-remote",
  "designer",
  "developer",
]);

// ── Classifier ─────────────────────────────────────────────────────────────

/** Flatten a scenario-like input into one searchable blob. */
export function flattenScenarioText(input: ScenarioLike): string {
  if (typeof input === "string") return input;
  const parts: string[] = [];
  if (input.name) parts.push(String(input.name));
  if (input.description) parts.push(String(input.description));
  if (input.brand && typeof input.brand === "string") parts.push(input.brand);
  const persona = input.character ?? input.persona;
  if (persona) {
    if (persona.name) parts.push(persona.name);
    if (persona.role) parts.push(persona.role);
    if (persona.description) parts.push(persona.description);
  }
  if (Array.isArray(input.scenes)) {
    for (const s of input.scenes) {
      if (s.keyframe_prompt_brief) parts.push(s.keyframe_prompt_brief);
      if (s.motion_prompt) parts.push(s.motion_prompt);
      if (s.voEn) parts.push(s.voEn);
      if (s.voRu) parts.push(s.voRu);
      if (s.notes) parts.push(s.notes);
    }
  }
  return parts.join("\n");
}

/** Return true if `name` is a generic archetype (no gate). */
export function isGenericArchetype(name: string | undefined | null): boolean {
  if (!name) return true;
  const norm = name.trim().toLowerCase();
  if (!norm) return true;
  if (GENERIC_ARCHETYPE_TOKENS.has(norm)) return true;
  // Multi-word generic role like "an engineer" / "a barista".
  const tokens = norm.replace(/[^a-z\s-]/g, "").split(/\s+/);
  for (const t of tokens) {
    if (GENERIC_ARCHETYPE_TOKENS.has(t)) return true;
  }
  return false;
}

/**
 * Core classifier — see module header for behavior.
 *
 * Returns `{ required: false }` when no real-entity tokens are detected.
 * Returns `{ required: true, kind, reason, matches }` on first hit (highest
 * priority order: person > brand-product > ip — to give clearest UX).
 */
export function needsReference(input: ScenarioLike): RefGateResult {
  const text = flattenScenarioText(input);
  if (!text || !text.trim()) return { required: false };

  const personMatches = collectMatches(text, KNOWN_PEOPLE);
  if (personMatches.length > 0) {
    // Filter out personas marked as generic in the structured field.
    if (typeof input !== "string") {
      const persona = input.character ?? input.persona;
      if (persona && persona.name && isGenericArchetype(persona.name) && personMatches.length === 1 && persona.name.toLowerCase().includes(personMatches[0]!.toLowerCase())) {
        // Persona name itself is generic — skip the false positive.
      } else {
        return {
          required: true,
          kind: "person",
          reason: `Named person referenced: ${personMatches.join(", ")}`,
          matches: personMatches,
        };
      }
    } else {
      return {
        required: true,
        kind: "person",
        reason: `Named person referenced: ${personMatches.join(", ")}`,
        matches: personMatches,
      };
    }
  }

  const brandMatches = collectMatches(text, KNOWN_BRANDS);
  if (brandMatches.length > 0) {
    return {
      required: true,
      kind: "brand-product",
      reason: `Brand / product referenced: ${brandMatches.join(", ")}`,
      matches: brandMatches,
    };
  }

  const ipMatches = collectMatches(text, KNOWN_IP);
  if (ipMatches.length > 0) {
    return {
      required: true,
      kind: "ip",
      reason: `IP / character referenced: ${ipMatches.join(", ")}`,
      matches: ipMatches,
    };
  }

  return { required: false };
}

function collectMatches(text: string, patterns: RegExp[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const re of patterns) {
    // Reset state for the global-flag-free scan; we read .exec once each.
    const m = re.exec(text);
    if (m && m[0]) {
      const key = m[0].toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(m[0]);
      }
    }
  }
  return out;
}

/**
 * Convenience: scenario plus an `attached_refs` array (e.g. from
 * `project.refs`) → returns the gate result PLUS whether the user already
 * satisfied it.
 */
export function checkReferenceGate(
  scenario: ScenarioLike,
  attachedRefs: { kind?: string; id?: string }[] = [],
): RefGateResult & { satisfied: boolean } {
  const r = needsReference(scenario);
  if (!r.required) return { ...r, satisfied: true };
  // We treat any attached ref as "the user provided one" — granular per-kind
  // matching is left to the agent in chat. The CLI floor only checks
  // presence.
  const hasAny = attachedRefs.length > 0;
  return { ...r, satisfied: hasAny };
}
