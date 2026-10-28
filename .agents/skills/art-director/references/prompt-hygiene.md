# Art director: prompt hygiene

> Moved out of `SKILL.md` to keep the skill body small (#574). Read on demand.

## Prompt hygiene

Three small rules every `ralphy generate` call should clear before submit. Each is a one-liner; each saves one regen cycle (~$0.15–$1) per occurrence and was filed from a real postmortem. See [notes/issues/done/050-anti-mockup-and-prompt-hygiene.md](../../../../notes/issues/done/050-anti-mockup-and-prompt-hygiene.md) for the bundle.

### 1. Anti-mockup directive (nano-banana / gemini-3-pro-image-preview)

`nano-banana` defaults to a **tiny iPhone-mockup-in-corner** composition unless the prompt explicitly forbids it. Without the forbid-string, even a clearly full-bleed brief (poster, hero, magazine layout) comes back with a postage-stamp phone floating in the lower third. Validated on `appstore-takeaminute-001` (`screen-01-hero-v2`/`-v4` both leaked mockups; 2 paid regens at $0.15 each before the directive went in; ~8 further regens prevented across the run).

**Rule.** Any full-bleed slot prompt for nano-banana / gemini-3-pro-image-preview MUST lead with the verbatim block below. The HERO / TROPE / CTA register from `appstore-takeaminute-001` is the canonical wording:

```
CRITICAL: This is a FULL-BLEED MAGAZINE POSTER LAYOUT — NO iPhone
device frame, NO phone mockup, NO screen bezel. The poster IS the
entire image edge-to-edge.
```

The player-UI-overlay variant (HD / video-content register) — use when the slot is "video still with player chrome drawn on top", not a poster:

```
CRITICAL: This is FULL-BLEED video content with a PLAYER UI OVERLAY
drawn directly on top — NO iPhone device frame, NO phone-mockup bezel
around the image. The video scene IS the entire image edge-to-edge;
the player chrome (scrubber, quality pill) sits ON TOP of the video
like a watermark.
```

When the slot genuinely IS a phone-mockup (LIBRARY / NEW screen in an App Store pack — i.e. the phone is the intended subject), invert the rule and **name the mockup explicitly** so nano-banana places it deliberately instead of as a leak:

```
CENTER VISUAL: sleek 3D angled iPhone mockup floating tilted, screen
showing <concrete scene description with named in-app content>. Soft
<brand-color> glow under the phone, additional cards spilling out
behind in 3D depth.
```

Naming actual in-app content (real series titles, real card text, the brand's real palette) makes nano-banana populate the mockup with plausible on-brand artwork instead of generic placeholders. Source: `.ralphy/workspaces/<ws>/projects/appstore-takeaminute-001/POSTMORTEM.md` § "Prompt patterns that worked (verbatim)".

### 2. Markdown punctuation in quoted strings

Markdown emphasis (`**bold**`, `_italic_`, `~strike~`) inside a typography slot **bakes literal asterisks / underscores into the rendered glyphs**. `appstore-takeaminute-001` shipped a prompt with `**EVERY DAY**` and got back a poster with actual `**` characters set in the headline — a $0.15 regen.

**Rule.** Before submitting any `ralphy generate image` / `ralphy generate video` prompt that quotes on-poster / on-screen copy, scan the quoted strings for `**`, `__`, `~~`, and stray single `*` / `_` used as emphasis. Strip them, OR replace them with a non-markdown emphasis directive (e.g. `the word EVERY DAY set larger / in the accent color`). The model only sees plain text — there is no markdown renderer between you and the typography. The CLI-side fix (auto-strip at the `cli/lib/providers/media.ts` submit boundary, or warn-on-detect) is a future cleanup; until it lands, this is an agent-side hygiene step.

### 3. Background-job file hygiene

Mirror of AGENTS.md invariant #17. `ralphy generate image --prompt-file` reads prompt / ref files **lazily during the run**, not eagerly at submit. Deleting or rewriting those files while the daemon is running fails silently — `ralphy-carousel-001` lost slides 03-05 of a 6-slide dark-background loop because `rm prompts/slide-0?.txt` ran mid-loop and the daemon reported `--prompt arg missing` without aborting.

**Rule.** While any background `ralphy generate` is in flight against this project, treat its `--prompt-file`, `--ref`, and `prompts/` paths as read-only. To swap a prompt, kill the job first and relaunch; do not edit-in-flight. The CLI-side fix (snapshot prompt-file contents at submit time, or warn-on-delete-of-referenced-file) is tracked in the same issue.
