# Scenarist: user-prompt logging stages

> Moved out of `SKILL.md` to keep the skill body small (#574). The MUST rule stays in `SKILL.md`.

**Named stages** (use one):

| `--stage` | When | Example user utterance |
|---|---|---|
| `brief` | The original ask that created the project, or any later message that reframes the project goal | "make a 15s unboxing for my coffee grinder" |
| `feedback` | User asks for a change to an existing artifact (scenario / scene / hook / VO) | "shorten scene 2", "rewrite the hook punchier", "swap the CTA" |
| `approval` | User signs off on a draft / variant — locks the artifact for the next stage | "looks good, ship it", "approved", "go with v2" |
| `critique` | User flags a problem but doesn't yet say how to fix it (you need to propose options) | "scene 3 feels AI-slop", "the pacing is off", "this doesn't match the ref" |
| `rejection` | User kills an entire direction / asks to start over on a scope chunk | "scrap the whole CTA arc", "no — different aesthetic entirely", "throw out v3" |

When the user message contains multiple stages (e.g. "approve scene 1 BUT rework scene 3"), log it twice — once per stage. The CLI is cheap; the postmortem layer is not.

**Out of scope as user-prompt turns** (do NOT log these, they are agent-internal):

- Your own clarifying questions back to the user.
- Status pings ("ok", "thanks", "yes") with no scenario impact.
- Automatic `--no-ref-consent` overrides (the CLI logs those itself with `stage: "no-ref-consent"`).

Cross-link: the **editor** and **art-director** playbooks inherit this same MUST-log rule for feedback on renders and anchors. See [`editor`](../../editor/SKILL.md) and [`art-director`](../../art-director/SKILL.md).
