import fs from "fs/promises";
import path from "path";

const args = process.argv.slice(2);
const inputDir = args[args.indexOf("--dir") + 1];

if (!inputDir) {
  console.error("Usage: --dir <path-to-reference-dir>");
  process.exit(1);
}

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_KEY) {
  console.error("OPENROUTER_API_KEY required");
  process.exit(1);
}

async function run() {
  const blueprintsDir = path.join(inputDir, "blueprints");
  const reelsDir = path.join(inputDir, "reels");

  // Find all blueprint directories
  const ids = (await fs.readdir(blueprintsDir).catch(() => [] as string[]))
    .filter((f) => !f.startsWith("."));

  if (ids.length === 0) {
    console.error("No blueprints found in", blueprintsDir);
    process.exit(1);
  }

  console.log(`Found ${ids.length} blueprints. Loading...`);

  const blueprints = [];
  for (const id of ids) {
    try {
      const bp = JSON.parse(
        await fs.readFile(path.join(blueprintsDir, id, "blueprint.json"), "utf-8")
      );
      blueprints.push({
        id,
        duration: bp.meta?.duration,
        summary: bp.analysis?.summary,
        category: bp.analysis?.category,
        hook: bp.analysis?.hook,
        format: bp.analysis?.format,
        editing: bp.analysis?.editing,
        audio: bp.analysis?.audio,
        viralFactors: bp.analysis?.viralFactors,
        contentAnalysis: bp.analysis?.contentAnalysis,
        reproductionGuide: bp.analysis?.reproductionGuide,
        transcript: bp.transcript?.text?.substring(0, 400),
      });
    } catch {}
  }

  console.log(`Loaded ${blueprints.length} blueprints. Generating strategy...`);

  const prompt = `You are an elite social media content strategist. You've analyzed the top performing reels from an Instagram account.

Here are the individual video analyses:

${JSON.stringify(blueprints, null, 2)}

Create a comprehensive STRATEGY DOCUMENT for replicating this account's success. Return JSON:

{
  "accountProfile": {
    "niche": "the content niche",
    "contentType": "what kind of videos they make",
    "brandVoice": "tone, personality, speaking style",
    "targetAudience": "who watches this"
  },
  "contentFormula": {
    "structure": "the repeating content structure ALL videos follow",
    "hookPatterns": ["list of hook patterns with specific examples from the videos"],
    "narrativeArc": "common story flow from start to end",
    "callToAction": "how they convert viewers (app, product, follow)",
    "averageDuration": "seconds",
    "postingFrequency": "how often based on dates"
  },
  "visualStyle": {
    "captionStyle": "subtitle/text overlay style description",
    "recommendedComponent": "which caption component to use: TikTokCaptions|KaraokeCaptions|GlowCaptions|BoxedCaptions|HormoziCaptions|MinimalCaptions|YellowPopCaptions|TypewriterCaptions|BounceCaptions|GradientHighlightCaptions|LuxuryMinimalCaptions",
    "colorPalette": "dominant colors",
    "lighting": "lighting style",
    "framing": "camera angles and distance",
    "setting": "where videos are shot"
  },
  "viralMechanics": {
    "topPattern": "the single most effective pattern found",
    "whyItWorks": "deep analysis of psychological triggers",
    "commonTriggers": ["emotional triggers shared across videos"],
    "retentionTechniques": ["what keeps people watching"],
    "shareabilityFactors": ["why people share these"]
  },
  "replicationPlan": {
    "step1_setup": "what you need (equipment, setting, persona)",
    "step2_hooks": ["5 ready-to-use hook templates based on their patterns"],
    "step3_structure": "scene-by-scene video structure template",
    "step4_editing": "editing instructions (pace, cuts, text overlays)",
    "step5_posting": "posting strategy (times, hashtags, description format)",
    "adaptationIdeas": ["how to apply this formula to OTHER niches"],
    "dosAndDonts": {
      "do": ["things that make their content work"],
      "dont": ["mistakes to avoid when copying this style"]
    }
  }
}

Be SPECIFIC. Use real examples from the analyzed videos. This will be used by AI agents to generate similar content automatically.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 8192,
      temperature: 0.3,
    }),
  });

  const data = (await response.json()) as any;
  let content = data.choices?.[0]?.message?.content || "";

  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
  let strategy;
  try {
    strategy = JSON.parse(jsonStr);
  } catch {
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    strategy = JSON.parse(jsonStr.substring(start, end + 1));
  }

  const outputPath = path.join(inputDir, "strategy.json");
  await fs.writeFile(outputPath, JSON.stringify(strategy, null, 2));
  console.log(`\nStrategy saved: ${outputPath}`);

  // Print summary
  console.log(`\n=== ACCOUNT STRATEGY ===`);
  console.log(`Niche: ${strategy.accountProfile?.niche}`);
  console.log(`Formula: ${strategy.contentFormula?.structure}`);
  console.log(`Top pattern: ${strategy.viralMechanics?.topPattern}`);
  console.log(`Caption component: ${strategy.visualStyle?.recommendedComponent}`);
  console.log(`Hooks:`);
  for (const h of strategy.replicationPlan?.step2_hooks || []) {
    console.log(`  - ${h}`);
  }
}

run().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
