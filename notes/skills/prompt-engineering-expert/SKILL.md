---
name: prompt-engineering-expert
description: |
  Expert prompt engineering, custom instruction, system prompt, and agent instruction design. Use when Codex needs to review, generate, refactor, debug, optimize, document, or test AI prompts; design reusable prompt templates; create or improve system prompts, custom instructions, agent behavior guidelines, tool-use prompts, multimodal prompts, or prompt evaluation frameworks.
license: MIT
---

# Prompt Engineering Expert

Use this skill to make prompts clearer, more reliable, easier to evaluate, and better matched to the model, task, tools, and operating context.

## Workflow

Identify the prompt's job: task, audience, model or agent context, available tools, inputs, output consumers, and failure cost.
Diagnose weaknesses before rewriting: ambiguity, missing context, conflicting instructions, brittle examples, unsafe scope, untestable success criteria, output format gaps, or token bloat.
Choose the lightest effective technique: direct instructions first; add roles, examples, structured tags, staged reasoning, tool-use guidance, or prompt chaining only when they solve a concrete issue.
Produce an improved prompt or instruction set with enough surrounding explanation for the user to evaluate the tradeoffs.
Define validation: expected behaviors, edge cases, regression cases, and success criteria.

## Response Pattern

For prompt reviews, prefer this structure:

- Diagnosis: the highest-impact issues, ordered by severity.
- Revision: a ready-to-use improved prompt.
- Why It Works: concise rationale for major changes.
- Tests: representative cases the user should run.

For prompt generation, prefer:

- Ask for missing high-risk constraints only if they cannot be reasonably assumed.
- Otherwise state assumptions and draft the prompt.
- Include variables/placeholders when the prompt should be reusable.
- Include a short evaluation checklist.

## Core Principles

- Make the task objective explicit.
- Give only the context needed to perform the task.
- State non-negotiable constraints separately from preferences.
- Specify the expected output format when downstream use matters.
- Use examples to teach patterns, not to smuggle one-off answers.
- Avoid hidden contradictions between role, task, constraints, and format.
- Prefer observable success criteria over subjective goals such as "high quality" or "good."
- Preserve model flexibility where multiple valid answers exist.
- Add safeguards for uncertainty: cite provided evidence, mark assumptions, and say what is unknown.

## Technique Selection

- Direct instruction: default for simple tasks.
- Few-shot examples: use when format, categorization, tone, or edge-case handling must be learned from examples.
- Structured tags or schemas: use when inputs, constraints, and outputs need clear boundaries or machine parsing.
- Role framing: use only when expertise, tone, or decision standards change the output.
- Staged reasoning or decomposition: use when the task has separable phases or frequent reasoning mistakes.
- Prompt chaining: use when one prompt is overloaded with extraction, analysis, transformation, and generation.
- Tool-use instructions: use when the agent must decide when to call tools, how to validate tool output, or how to recover from tool errors.
- Multimodal instructions: use when images, PDFs, spreadsheets, code, or other files require explicit inspection targets.
- See references/techniques.md [blocked] for patterns and compact examples.

## Custom Instructions And Agent Prompts

When designing system prompts, custom instructions, or agent skills:

- Define the agent's role through responsibilities and decision standards, not theatrical persona.
- Separate mandatory behavior from style preferences.
- Include boundaries: what to refuse, what to escalate, what to ask about, and what to infer.
- Keep instructions stable across turns; avoid directions that require mutating past context.
- For tool-using agents, specify tool selection, validation, retry, and user-update behavior.
- For coding agents, include repository conventions, test expectations, and change-safety rules.

Anti-Patterns
Watch for:

## Vague verbs: "analyze," "improve," "make better," "handle this."

Contradictions: "be concise" plus many mandatory sections, or "do not ask questions" plus missing required data.
Overfitted examples that teach accidental details.
Output formats described in prose when a schema or example is needed.
Prompts that invite hallucination by asking for facts without sources or data.
Security gaps: untrusted user content can override instructions, leak context, or request unsafe actions.
Token bloat from background essays, duplicated rules, and unused options.
See references/troubleshooting.md [blocked] for failure modes and fixes.

## Evaluation

Every non-trivial prompt improvement should include tests:

- Happy path with typical input.
- Edge case with missing, ambiguous, or malformed input.
- Regression case for a known failure.
- Adversarial or injection case when untrusted input is involved.
- Format compliance case when downstream parsing matters.
- See references/evaluation.md [blocked] for test templates and scoring rubrics.

## Reference Loading

Load only the references needed for the request:

- references/techniques.md [blocked]: prompting techniques, when to use each, and compact examples.
- references/troubleshooting.md [blocked]: common prompt failures, diagnosis, and fixes.
- references/evaluation.md [blocked]: prompt test cases, rubrics, and regression strategy.
- references/examples.md [blocked]: reusable prompt review, generation, classification, structured-output, and agent-instruction examples.
