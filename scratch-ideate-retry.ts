import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { callLLM } from "./cli/lib/providers/llm.js";
const BRIEF = readFileSync("scratch-ideate.ts", "utf8").split("const BRIEF = `")[1].split("`;\n")[0];
const OUT = ".ralphy/workspaces/content-lab/projects/evilcorp-pilot-001/ideation";
mkdirSync(OUT, { recursive: true });
for (const model of ["google/gemini-3.1-pro-preview"]) {
  try {
    const r = await callLLM({
      model,
      messages: [
        { role: "system", content: "Output ONLY the final deliverable. Do not show reasoning, scratchpad, word-counting or self-talk." },
        { role: "user", content: BRIEF },
      ],
      temperature: 1, maxTokens: 12000,
      projectId: "evilcorp-pilot-001", endpoint: "ideate/engine-fanout-retry",
    });
    writeFileSync(`${OUT}/${model.replace(/[/.]/g, "-")}.md`, `# ${model} (retry)\n\n${r.text}\n`);
    console.log(`OK ${model} ${r.text.length} chars ${r.latencyMs}ms`);
  } catch (e) { console.log(`FAIL ${model} ${(e as Error).message.slice(0, 140)}`); }
}
