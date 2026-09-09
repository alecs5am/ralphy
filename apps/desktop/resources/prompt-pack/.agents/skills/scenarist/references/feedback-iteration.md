# Feedback iteration

## When this fires

User gave feedback on an existing scenario:
- "scene 2 weak" / "rework hook" / "tighten VO clip 4"
- "make it shorter" / "make it longer"
- "change persona" / "change setting"
- "VO too fast / too slow"

## Steps (surgical)

1. **Log feedback verbatim — most important step:**
   ```bash
   ralphy project log-prompt <id> --text "<feedback>" --stage scenario-feedback
   ```
   This is the cheapest durable record. Without it, context history is lost.

2. **Read current `scenario.json`** + the specific sections the feedback targets.

3. **Apply surgically** — do not rewrite untouched scenes:
   - Preserve scene IDs where possible (`scene-01`, `scene-02`, ...) — downstream `prompts.json` / `asset-manifest.json` keys depend on them.
   - If a scene is split / removed — note this **explicitly** in the diff so the art director knows which slots are stale.
   - Don't change voice / persona / setting unless the feedback is about them.

4. **Recompute timing if duration changed:**
   - Update top-level `durationSec` / `durationFrames`.
   - Verify sum(scenes) ≤ duration.

5. **Re-run quality gate:**
   ```bash
   ralphy project score <id>
   ```
   If fail — fix → re-run.

6. **Diff summary in chat** — sanity-check before art direction spends $:
   > "scene-02 VO from 5 lines → 3; hook rewritten; duration 32s → 28s; scene-04 unchanged."

## Cost-aware handoff

After feedback, decide **what exactly to regenerate**:

| What changed | What we regen in art-director |
|---|---|
| VO text only | Voiceover slots only (cheap, ~$0.30/scene) |
| Entire hook scene | scene-01 image + video + VO + caption |
| Visual without VO | Image + video, no VO |
| Setting / persona | All image + video slots, no VO |
| Pacing / timing | Composition only (editor), no regen |
| Captions style | Composition only (editor) |

Hand off with an **explicit note**: "voiceover slots only: scene-02, scene-03". This saves the user $$.

## Iteration limit

If a single scene has gotten ≥3 feedback rounds and still isn't landing — stop, tell the user:
> "Scene-XX has been redone 3 times and we're not converging. Options: a) drop a reference frame of what you want, b) swap this scene for a different beat, c) tell me in one sentence what should work in this scene. Without that, continuing = just burning time."

## Hand off rules

- Visual + VO changes → `art-director playbook` full regen for affected scenes.
- VO-only changes → `art-director playbook` with note "VO only" (saves money).
- Composition / pacing only → `editor playbook` (assets are still good).
- If feedback requires a fundamentally new brief → hand back to `producer playbook` to clarify with the user.
