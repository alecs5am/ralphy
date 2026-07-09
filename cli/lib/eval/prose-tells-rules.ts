// AI-tell rule pack (DATA) for the prose lint (#529).
//
// The rules are DATA, not logic — each is a pattern + metadata (source, level,
// examples). `prose-tells.ts` is the engine that runs them. Every rule cites its
// documented source (the Wikipedia "Signs of AI writing" guide, via the
// `humanizer` skill) — the same craft-as-data pattern as #514/#515.
//
// Two rule kinds:
//   • "phrase"  — a case-insensitive regex over the body; each match is a hit.
//   • "density" — a regex whose match COUNT per 1000 words is compared to a
//                 ceiling (`maxPer1000`); over the ceiling → the rule fires once.
//
// English-first rule pack v1. LANGUAGE-EXTENSION SEAM: the vocabulary + phrase
// patterns are English. To add another language, add sibling rule packs keyed by
// language (e.g. `RULES_ES`) and have `prose-tells.ts` pick the pack from the
// unit's target-audience language; the ENGINE stays language-agnostic. Latin
// script only on disk (these English words are being DETECTED, not authored as
// content — the on-disk rule is satisfied).
//
// English-only-on-disk.

export type ProseRuleLevel = "warn" | "fail";

export interface ProseRule {
  /** Stable kebab-case id, used in the finding category `structure.ai-tell.<id>` / `captions.ai-tell.<id>`. */
  id: string;
  /** Human label. */
  label: string;
  /** "phrase" = each match is a hit; "density" = match-count per 1000 words vs a ceiling. */
  kind: "phrase" | "density";
  /** The detection pattern (global, case-insensitive applied by the engine). */
  pattern: RegExp;
  /** For "density" rules: max matches allowed per 1000 words before the rule fires. */
  maxPer1000?: number;
  /** warn | fail. */
  level: ProseRuleLevel;
  /** The concrete fix the finding hint carries. */
  fix: string;
  /** Documented source of the rule. */
  source: string;
  /** One violating + one clean example (English). */
  examples: { bad: string; good: string };
}

const WIKI = "Wikipedia: Signs of AI writing (via the humanizer skill)";

/** English rule pack v1. Ordered roughly by the humanizer guide's sections. */
export const RULES_EN: ProseRule[] = [
  {
    id: "inflated-symbolism",
    label: "Undue emphasis on significance / legacy",
    kind: "phrase",
    pattern:
      /\b(stands as a testament|is a testament|serves as a reminder|marking a pivotal moment|evolving landscape|plays a (?:vital|crucial|pivotal|key) role|underscor(?:es|ing) (?:its|the) (?:importance|significance)|setting the stage for|represents a shift|key turning point|indelible mark|deeply rooted)\b/gi,
    level: "warn",
    fix: "Cut the significance inflation — state the plain fact without claiming it represents a broader trend.",
    source: `${WIKI} §1`,
    examples: {
      bad: "The institute was founded in 1989, marking a pivotal moment in the evolution of regional statistics.",
      good: "The institute was founded in 1989 to publish regional statistics.",
    },
  },
  {
    id: "superficial-ing",
    label: "Superficial -ing analyses",
    kind: "density",
    pattern:
      /\b(highlighting|underscoring|emphasizing|ensuring|reflecting|symbolizing|contributing to|cultivating|fostering|encompassing|showcasing)\b/gi,
    maxPer1000: 6,
    level: "warn",
    fix: "Replace tacked-on '-ing' participle phrases with a plain independent clause or delete them.",
    source: `${WIKI} §3`,
    examples: {
      bad: "The palette resonates with the region, symbolizing the landscape, reflecting the community's connection.",
      good: "The palette uses blue and gold, chosen to reference the local coast.",
    },
  },
  {
    id: "promotional",
    label: "Promotional / advertisement-like language",
    kind: "phrase",
    pattern:
      /\b(boasts a|nestled (?:in|within)|in the heart of|must-visit|breathtaking|stunning natural beauty|rich (?:cultural )?heritage|renowned for|a vibrant (?:town|city|community))\b/gi,
    level: "warn",
    fix: "Drop the travel-brochure adjectives — describe the thing plainly.",
    source: `${WIKI} §4`,
    examples: {
      bad: "Nestled in the breathtaking region, the town boasts a rich cultural heritage.",
      good: "The town is in the region and is known for its weekly market.",
    },
  },
  {
    id: "vague-attribution",
    label: "Vague attributions / weasel words",
    kind: "phrase",
    pattern:
      /\b(industry reports (?:suggest|show|indicate)|observers have (?:cited|noted)|experts (?:argue|believe|say)|some critics argue|studies (?:suggest|show) that|it is (?:widely )?believed that)\b/gi,
    level: "warn",
    fix: "Attribute to a specific named source, or cut the claim.",
    source: `${WIKI} §5`,
    examples: {
      bad: "Experts believe it plays a crucial role in the ecosystem.",
      good: "A 2019 survey by the Academy of Sciences recorded several endemic species there.",
    },
  },
  {
    id: "ai-vocabulary",
    label: "Overused AI-vocabulary words",
    kind: "density",
    pattern:
      /\b(delve|delves|delving|tapestry|intricate|intricacies|interplay|underscore|underscores|multifaceted|realm|leverage(?:s|d)?|seamless(?:ly)?|robust|holistic|myriad|plethora)\b/gi,
    maxPer1000: 5,
    level: "warn",
    fix: "Swap the 'delve'-class vocabulary for plain words (delve → look at, leverage → use, intricate → complex, realm → area).",
    source: `${WIKI} §7`,
    examples: {
      bad: "Let us delve into the intricate tapestry of this multifaceted realm.",
      good: "Here is how the system works.",
    },
  },
  {
    id: "copula-avoidance",
    label: "Copula avoidance (elaborate substitutes for is/are)",
    kind: "density",
    pattern: /\b(serves as|stands as|functions as|acts as|represents a|boasts|offers up)\b/gi,
    maxPer1000: 4,
    level: "warn",
    fix: "Use plain 'is' / 'are' / 'has' instead of 'serves as' / 'stands as' / 'boasts'.",
    source: `${WIKI} §8`,
    examples: {
      bad: "The gallery serves as an exhibition space and boasts four rooms.",
      good: "The gallery is an exhibition space and has four rooms.",
    },
  },
  {
    id: "negative-parallelism",
    label: "Negative parallelisms",
    kind: "phrase",
    pattern:
      /\b(it'?s not (?:just|merely|only) (?:about )?[^.,;]+[,;]?\s*it'?s|not only[^.]*but(?: also)?)\b/gi,
    level: "fail",
    fix: "Rewrite 'It's not just X, it's Y' / 'Not only X but Y' as one direct statement.",
    source: `${WIKI} §9`,
    examples: {
      bad: "It's not just a song, it's a statement.",
      good: "The song makes a strong statement.",
    },
  },
  {
    id: "rule-of-three",
    label: "Rule-of-three triads",
    kind: "density",
    // Three comma-separated items ending "..., X, and Y" — the tell fires on frequency.
    pattern: /\b[a-z]+,\s+[a-z]+,?\s+and\s+[a-z]+\b/gi,
    maxPer1000: 6,
    level: "warn",
    fix: "Break up the forced triads — not every list needs exactly three parallel items.",
    source: `${WIKI} §10`,
    examples: {
      bad: "It offers innovation, inspiration, and insight, with talks, panels, and networking.",
      good: "It has talks and panels, plus time to network.",
    },
  },
  {
    id: "false-range",
    label: "False 'from X to Y' ranges",
    kind: "phrase",
    pattern: /\bfrom [^.,]+ to [^.,]+,\s+from [^.,]+ to [^.,]+/gi,
    level: "warn",
    fix: "Drop the 'from X to Y, from A to B' construction when the pairs aren't a real scale — just list the items.",
    source: `${WIKI} §12`,
    examples: {
      bad: "from the birth of stars to dark matter, from the Big Bang to the cosmic web.",
      good: "The book covers the Big Bang, star formation, and dark matter.",
    },
  },
  {
    id: "em-dash-density",
    label: "Em-dash overuse",
    kind: "density",
    pattern: /—/g,
    maxPer1000: 4,
    level: "warn",
    fix: "Replace most em dashes with commas, periods, or parentheses — humans rarely use this many.",
    source: `${WIKI} §14`,
    examples: {
      bad: "The term is promoted by institutions—not the people—yet it continues—even officially.",
      good: "The term is promoted by institutions, not the people, yet it continues in official use.",
    },
  },
  {
    id: "persuasive-authority",
    label: "Persuasive-authority tropes",
    kind: "phrase",
    pattern:
      /\b(the real question is|at its core|in reality,|what really matters|fundamentally,|the deeper issue|the heart of the matter)\b/gi,
    level: "warn",
    fix: "Cut the 'the real question is' / 'at its core' framing and state the point directly.",
    source: `${WIKI} §27`,
    examples: {
      bad: "The real question is whether teams can adapt. At its core, what matters is readiness.",
      good: "The question is whether teams can adapt.",
    },
  },
  {
    id: "signposting",
    label: "Signposting / announcements",
    kind: "phrase",
    pattern:
      /\b(let'?s (?:dive in|dive into|explore|break (?:this|it) down)|here'?s what you need to know|without further ado|now let'?s look at)\b/gi,
    level: "warn",
    fix: "Delete the 'let's dive in' meta-commentary and just start the content.",
    source: `${WIKI} §28`,
    examples: {
      bad: "Let's dive into how caching works. Here's what you need to know.",
      good: "Caching works at several layers.",
    },
  },
  {
    id: "chatbot-artifacts",
    label: "Collaborative / chatbot artifacts",
    kind: "phrase",
    pattern:
      /\b(i hope this helps|let me know if|would you like me to|here is an? (?:overview|essay|summary)|great question!|certainly!|of course!)\b/gi,
    level: "fail",
    fix: "Strip the chatbot correspondence — it should never appear in published content.",
    source: `${WIKI} §20`,
    examples: {
      bad: "Here is an overview of the topic. I hope this helps! Let me know if you'd like more.",
      good: "The topic breaks down into three parts.",
    },
  },
  {
    id: "generic-conclusion",
    label: "Generic positive conclusions",
    kind: "phrase",
    pattern:
      /\b(the future looks bright|exciting times (?:lie )?ahead|a (?:major |significant )?step in the right direction|continue(?:s)? (?:their|its|the) journey toward)\b/gi,
    level: "warn",
    fix: "Replace the vague upbeat closer with a concrete, specific next fact.",
    source: `${WIKI} §25`,
    examples: {
      bad: "The future looks bright. Exciting times lie ahead on the journey toward excellence.",
      good: "The company plans to open two more locations next year.",
    },
  },
];
