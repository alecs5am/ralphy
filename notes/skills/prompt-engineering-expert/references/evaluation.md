# Prompt Evaluation
Evaluate prompts with concrete cases and observable criteria. Do not rely on whether one sample output "looks good."

## Test Case Template

markdown

## Test: <name>

Input:
<representative user input or artifact>

Expected behavior:
- <required behavior>
- <required behavior>

Failure signs:
- <observable bad behavior>
- <observable bad behavior>

## Minimum Test Set

Happy path: normal, well-formed input.
Ambiguous input: missing data or unclear intent; prompt should infer safely or ask a targeted question.
Edge case: unusual length, format, domain, or constraint.
Regression case: prior failure the rewrite must fix.
Adversarial case: untrusted input asks the model to ignore instructions or reveal hidden context.
Format case: output must satisfy the exact schema or downstream parser.

## Scoring Rubric

Use a 1-5 score per dimension:

- Instruction adherence: follows task, constraints, and format.
- Grounding: distinguishes provided facts from assumptions.
- Specificity: gives concrete, useful content instead of generic advice.
- Completeness: covers required dimensions without unnecessary expansion.
- Robustness: handles edge cases and malformed inputs.
- Efficiency: avoids avoidable token bloat.
- Define pass/fail thresholds before testing. For example: "No dimension below 4, format must be valid JSON, and no unsupported factual claim."

## A/B Testing

When comparing prompt versions:

- Use the same model, temperature, tools, and input set.
- Blind-review outputs when practical.
- Score before reading explanations of the prompt changes.
- Track both quality and variance.
- Keep the simpler prompt if quality is equivalent.

## Regression Strategy

Keep a small bank of cases that previously failed. For every prompt revision, check whether it:

- Fixes the original issue.
- Preserves successful behavior from prior versions.
- Avoids creating new format or safety failures.

## Evaluation Output Template

- markdown

| Case | Pass/Fail | Key Observations | Required Fix |
|---|---|---|---|
| Happy path | Pass | ... | None |
| Ambiguous input | Fail | ... | Add clarification rule |
When To Ask For More Data
Ask the user for examples or logs when:

- The failure depends on a private model, tool, or production workflow you cannot inspect.
- The desired style or quality bar is subjective.
- The prompt must satisfy a downstream parser or policy you have not seen.
- The user reports inconsistency but provides only one output.
