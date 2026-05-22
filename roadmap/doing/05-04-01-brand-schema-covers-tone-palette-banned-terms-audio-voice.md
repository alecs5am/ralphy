---
id: 05.04.01
status: doing
v1_0: yes
category: 05-project-resources
topic: "05.04 Brand & Persona as first-class"
title: "Brand schema covers tone, palette, banned terms, audio voice"
---

# 05.04.01 — Brand schema covers tone, palette, banned terms, audio voice

**v1.0:** yes

**Acceptance criteria:**
- `brand.json` schema includes: `tone[]`, `palette: {primary, secondary, accent}`, `banned_terms[]`, `voice_id` (ElevenLabs), `music_style[]`, `logo_path?`, `safe_zones?`.
- Validation via `ralphy brand validate <id>`.
- Documented in `docs/brand-schema.md`.
