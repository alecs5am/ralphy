# Prompt Engineering Techniques
Use the smallest technique that solves the observed failure. Strong prompts usually combine clear task framing, bounded context, explicit constraints, and a verifiable output shape.

## Direct Instructions

Use for simple tasks where the input and desired output are obvious.

text

Summarize the following incident report in 5 bullets. Include impact, root cause, mitigation, owner, and deadline. If any field is missing, write "Not provided."
Few-Shot Prompting
Use examples when the model needs to infer a label taxonomy, style, transformation pattern, or edge-case behavior.

Rules:

- Use realistic examples.
- Include edge cases, not only easy cases.
- Keep labels and formats consistent.
- Avoid examples that contain irrelevant details likely to be copied.
- text

Classify support tickets as billing, technical, feature_request, or general.

- Ticket: "I was charged twice this month"
- Category: billing

- Ticket: "The app crashes when I upload a 100MB file"
- Category: technical

- Ticket: "Could you add dark mode?"
- Category: feature_request

## Ticket: "{ticket}"

Category:

## Structured Tags And Schemas

- Use XML-like tags, JSON schemas, or markdown sections when inputs, constraints, examples, and output requirements need clear boundaries.

xml

<task>
  <objective>Extract action items from the meeting notes.</objective>
  <constraints>
    <constraint>Use only information present in the notes.</constraint>
    <constraint>Mark missing owners as "Unassigned".</constraint>
  </constraints>
  <output_format>
    [{"action":"...", "owner":"...", "deadline":"..."}]
  </output_format>
</task>
Role Framing
Use role framing when domain standards matter. Avoid inflated personas.

text

Act as a senior privacy reviewer. Evaluate the policy for unclear consent language, data retention gaps, and missing user rights disclosures. Cite exact phrases from the policy before recommending edits.

## Staged Reasoning

Use decomposition when the task fails because steps are skipped or mixed together. Request visible analysis only when the user needs it; otherwise ask for a concise final answer plus key assumptions.

text

Analyze this decision in stages:
1. List the decision criteria.
2. Compare each option against the criteria.
3. Identify the highest-risk assumption.
4. Recommend one option with caveats.

## Prompt Chaining

Split a prompt when it tries to extract, clean, reason, transform, and write at once.

Common chain:

- Extract structured facts from source material.
- Validate or normalize the extracted facts.
- Analyze the facts.
- Generate the final artifact.
- Chaining is useful when intermediate outputs need review, reuse, or deterministic validation.

## Tool-Use Prompting

For tool-using agents, specify:

- When to use a tool.
- Which sources are authoritative.
- How to handle failed or conflicting tool results.
- What to report to the user while working.
- What not to infer without evidence.
- text

Use repository search before editing. Prefer existing helpers and patterns. After edits, run the narrowest relevant tests. If tests cannot run, explain why and name the residual risk.

## Multimodal Prompting

For images, documents, spreadsheets, and code files:

- State what to inspect.
- Define the expected output.
- Ask for uncertainty where visual or OCR quality may matter.
- Separate observed facts from interpretation.
- text

Inspect the uploaded dashboard screenshot for layout regressions. Focus on clipped text, overlapping controls, missing data, and inconsistent spacing. Return findings with severity and location.

## Prefilling And Output Anchors

Use prefilling or output anchors when a model drifts away from the desired format. Do not rely on prefill alone; still specify the schema.

text

Return only this JSON object:

- {
- "summary": "",
- "risks": [],
- "unknowns": []
- }

## Technique Combination

Combine techniques only when each has a job:

- Role for domain standards.
- Tags for separating context.
- Few-shot examples for output pattern.
- Chain for complex transformations.
- Evaluation rubric for measurable quality.
- If a technique does not address a known failure mode, remove it.
