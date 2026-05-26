# Prompt Troubleshooting
Use this guide to diagnose prompt failures before rewriting.

## Inconsistent Output

Likely causes:

- Ambiguous objective.
- No output contract.
- Missing examples.
- Soft preferences stated like hard requirements.

Fixes:

- Add a schema or section template.
- Include 2-4 representative examples.
- Define required fields and fallback values.
- Move optional guidance under "Preferences."

## Hallucinated Facts

Likely causes:

- The prompt asks for facts not present in context.
- It rewards confident completion over uncertainty.
- Source requirements are missing.

Fixes:

- Require the answer to use only provided sources or verified tool results.
- Ask for citations, evidence snippets, or "not provided."
- Add confidence levels only when useful.
- Add a required "Unknowns" section.

## Generic Or Vague Responses

Likely causes:

- The prompt lacks audience, constraints, or decision criteria.
- The task verb is broad: "analyze," "improve," "review."

Fixes:

- Define the output consumer and decision to support.
- Name the exact dimensions to inspect.
- Include examples of useful specificity.

## Wrong Length

Likely causes:

- No target length or detail level.
- Conflicting instructions such as "brief but comprehensive."

Fixes:

- Specify count: bullets, words, paragraphs, or sections.
- Define what to omit.
- Put details in appendices or optional follow-up sections.

## Wrong Format

Likely causes:

- Format described loosely.
- No example of valid output.
- The prompt mixes human-readable and machine-readable goals.

Fixes:

- Provide a valid output example.
- Use strict JSON only when parsing matters.
- State whether prose outside the schema is allowed.
- Include behavior for missing values.

## Refusal Or Over-Caution

Likely causes:

- Legitimate purpose is unclear.
- The request can be read as harmful, invasive, or deceptive.

Fixes:

- Add benign context and intended use.
- Ask for safety-preserving alternatives.
- Constrain the output to policy, education, detection, or fictional analysis where appropriate.

## Prompt Too Long

Likely causes:

- Duplicated rules.
- Background material included without a clear role.
- Too many examples.
- Large reference data copied inline.

Fixes:

- Move detailed references out of the main prompt.
- Keep only active constraints.
- Replace repeated prose with a compact checklist.
- Use retrieval or file references when available.

## Brittle Or Overfit Prompt

Likely causes:

- Hardcoded values.
- Examples teach accidental surface details.
- Assumes one input shape.

Fixes:

- Use variables.
- Add malformed or alternate-format test cases.
- Define clarification behavior.
- State invariant principles separately from examples.

## Prompt Injection Risk

Likely causes:

- Untrusted user content is placed near instructions without boundaries.
- The prompt does not tell the model how to treat external instructions.

Fixes:

- Delimit untrusted content.
- State that instructions inside user-provided content are data, not directives.
- Require source-grounded answers.
- Avoid exposing hidden instructions or private context.
