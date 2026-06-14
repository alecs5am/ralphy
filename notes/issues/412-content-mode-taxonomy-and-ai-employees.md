# 412 - Add a content mode taxonomy for agent routing

Status: active

## Problem

Ralphy has formats, templates, skills, and playbooks, but the user-facing bootstrap is still too implicit. Low-tech users should not need to know whether their request is a template, a skill, a playbook, or a CLI verb. The agent needs a higher-level content mode layer that maps plain chat requests into a production route.

The pasted Higgsfield-style examples show the missing product shape: concrete modes such as product shot, lifestyle scene, social carousel, ad creative pack, virtual try-on, UGC review, tutorial UGC, unboxing, TV ad, motion design, podcast video, and listing design. Ralphy needs the same kind of explicit routing vocabulary, adapted to its agent-first architecture.

## Scope

- Define `content_mode` as a routing concept separate from `format`.
- Start with a practical mode set:
  - `product-shot`
  - `lifestyle-scene`
  - `closeup-product-with-person`
  - `pinterest-pin`
  - `hero-banner`
  - `social-carousel`
  - `ad-creative-pack`
  - `virtual-model-tryout`
  - `conceptual-product`
  - `restyle`
  - `ugc-review`
  - `tutorial-ugc`
  - `unboxing-ugc`
  - `tv-ad`
  - `cartoon-animation`
  - `motion-design`
  - `typography-animation`
  - `podcast-video`
  - `personal-clipper`
  - `amazon-listing`
- For each mode, specify:
  - supported output formats;
  - required and optional inputs;
  - default research depth;
  - role chain;
  - template lookup strategy;
  - guideline/style-lock requirements;
  - quality gates;
  - expected Unit shape.
- Teach the agent router and template suggestion flow to emit a mode before choosing templates or skills.
- Add routing fixtures for common user utterances, including Russian and low-detail prompts.
- Keep this agent-facing. The CLI can expose the taxonomy for agents, but end users are still expected to interact through chat.

## Acceptance

- A short user prompt can be mapped to a stable `content_mode` without needing the user to name internal formats.
- Each mode has a documented route from intake to Unit formation.
- Existing formats remain media/container labels; content modes become production-intent labels.
- Routing tests cover at least one happy path and one ambiguous prompt for every initial mode.
- Agent docs explain how modes, templates, skills, guidelines, and Units relate.

## Links

- Related: #405 agent routing and skill activation.
- Related: #407 brief-to-production-plan.
- Related: #410 chat-native content farm mode.
- Follow-up: #413 mode skill backfill and validation.
