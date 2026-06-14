# Memory coverage matrix (issue #060)

> Audit of the local agent-memory store
> (`~/.claude/projects/-Users-maximovchinnikov-github-ugc-cli/memory/`) against the
> public repo. One row per memory entry. Goal: find battle-tested craft knowledge
> that is NOT yet public and port the generalizable parts (English-only,
> paraphrased) into `MODELS.md` / `guidelines/` / `docs/playbooks/` / skill bodies.

## Buckets

- **PORT** — generalizable craft not (fully) public yet; ported in this pass.
- **ALREADY-PUBLIC** — already reflected somewhere public (cited).
- **LOCAL-ONLY** — machine-specific, personal, or project-state-specific; stays local.
- **PORT-deferred** — generalizable in principle but too niche / not confidently
  general; left for a future pass with a note.

## Counts

- PORT: 14
- ALREADY-PUBLIC: 27
- LOCAL-ONLY: 33
- PORT-deferred: 12

## Matrix

| slug | gist | class | already-public? | target (if porting) | action |
|---|---|---|---|---|---|
| feedback_anti_ai_slop_image | real camera/lens + pores + asymmetry + film grain + ban beauty-filter | ALREADY-PUBLIC | `guidelines/photoreal-studio-portraits` (six-token spine + negative cluster) | — | none |
| feedback_photoreal_still_register | Sony A7 IV + Sigma + Portra 400 + single soft light + restate identity | ALREADY-PUBLIC | `guidelines/photoreal-studio-portraits` | — | none |
| feedback_super_original_refs | lock product/model master, pass `--ref` on every gen | ALREADY-PUBLIC | `photoreal-studio-portraits` (identity-lock section) + MODELS.md image-ref note | — | none |
| feedback_oldspice_style_dna | bright high-key + oiled chest + mouth-open + impossible match-cut | PORT | new `guidelines/oldspice-absurd-spokesman` | ported |
| feedback_deliberate_prop_vfx_old_spice | 5 tells for "intentional fake" prop (matte rubber, kelly green, seams…) | PORT | `guidelines/oldspice-absurd-spokesman` (prop section) | ported |
| feedback_start_end_frame_motion_delta | start≠end frame must show a distinct physical beat | PORT | `guidelines/oldspice-absurd-spokesman` (motion-delta section) | ported |
| feedback_broadcast_realism_square | "caught on TV" trends → 1:1 square reads more real than 9:16 | PORT | new `guidelines/broadcast-realism-aspect` | ported |
| feedback_no_neon_vulgar | user dislikes neon grades; default natural/muted | PORT | new `guidelines/broadcast-realism-aspect` (cross-cutting palette note) | ported (as a general palette default) |
| feedback_gpt_image_voxel_ps1_framing | name games + their screenshots as dominant ref; don't ref own cinematic frame | PORT | new `guidelines/indie-ps1-ps2-horror` | ported |
| feedback_sad3d_ps2_cutscene_register | sad/doomer 3D = PS2 SH2 cutscene, NOT crude PS1 | PORT | `guidelines/indie-ps1-ps2-horror` (PS2 register) | ported |
| feedback_vg_model_picks | kling for default UGC selfie; seedance for horror/POV/physics | ALREADY-PUBLIC | MODELS.md "Routing rules (which video model for what)" | — | none |
| feedback_seedance_rejects_realistic_people | seedance privacy filter blocks photoreal-human anchors | ALREADY-PUBLIC | MODELS.md lesson #6 + failure-modes + tried-and-dropped | — | none |
| feedback_i2v_provider_filters | seedance/veo/kling filter matrix for body-horror | ALREADY-PUBLIC | MODELS.md lessons #6/#10/#11 + failure-modes | — | none |
| feedback_image_safety_thresholds | gpt-image passes body-horror where gemini IMAGE_SAFETY | ALREADY-PUBLIC | MODELS.md image failure-modes + lesson #10 | — | none |
| feedback_seedance_ps1_death_beat_patterns | default single first-frame; describe death; keep world alive | PORT-deferred | partly MODELS.md (last-frame caveat) | left local — choose-path-niche, lives in batch postmortem |
| feedback_seedance_i2v_parallel | independent seedance i2v clips parallelize (cap=1 only for extend) | PORT | MODELS.md lesson (concurrency nuance) | ported |
| feedback_seedance_multiblock_i2v_extend | extend stylized video via last-frame anchor, use 15s blocks | PORT-deferred | — | left local — narrow "extend" recipe; noted |
| feedback_idle_ending_anchor_clean_still | anchor idle/ending i2v on clean char STILL not video last-frame | PORT-deferred | — | left local — choose-path-niche |
| feedback_photoreal_xray_gemini_wins | gemini-3 beats gpt-image for photoreal radiograph register | PORT | MODELS.md image picks (register-specific model pick) | ported |
| feedback_biofix_cgi_specimen_not_xray | bio_fix = CGI translucent specimen, NOT radiograph | LOCAL-ONLY | — | project/profile-specific register correction; methodology lesson kept local |
| feedback_seedance_r2v_multiref | seedance r2v `--ref` works for non-human refs; humans blocked; text gibberish | ALREADY-PUBLIC | MODELS.md "fal connector" + lesson #6b (OR input_references) | — | none |
| feedback_openrouter_parallel_gpt_image | gpt-image NOT hard-capped to 1; validate empirically | ALREADY-PUBLIC | MODELS.md image failure-modes (cap=2 note + "NOT a $ balance" rewrite) | — | none |
| feedback_kling_no_ru_audio | kling `--audio` EN-clean, slips on RU/UA | ALREADY-PUBLIC | MODELS.md `--audio` policy + failure-modes + tried-and-dropped | — | none |
| feedback_kling_no_music_eleven_music_postmix | kling bans music in prompt; music = separate 11labs pass | ALREADY-PUBLIC | MODELS.md fal-connector note + music section + `--audio` policy | — | none |
| feedback_elevenlabs_music_no_artist_names | 11labs Music ToS blocks named artists; resubmit prompt_suggestion | ALREADY-PUBLIC | MODELS.md music "Prompt content policy" + failure-modes | — | none |
| feedback_elevenlabs_geoblock_html_in_mp3 | 11labs geo-block returns HTML-as-mp3; fall back to Kokoro | ALREADY-PUBLIC | MODELS.md failure-modes (scribe/voice UA→403) | — | none |
| feedback_elevenlabs_proxy_server_clone | run 11labs on a non-blocked SSH proxy VPS | LOCAL-ONLY | `elevenlabs-proxy` skill exists; the specific VPS IPs/keys are machine-specific | none |
| project_kling_practical_limits | 2500-char cap, `--audio` renders speech, voice-tag block, ban music | ALREADY-PUBLIC | MODELS.md lesson #7 + failure-modes (2500-char cap) | — | none |
| feedback_hyperframes_multiscene_gating | multi-scene = ONE opacity-gated comp, not data-composition-src sub-comps | PORT | `docs/playbooks/hyperframes.md` Hard-kills table | ported |
| feedback_hyperframes_video_crossfade_bake | video↔video crossfade renders as hard cut; bake via ffmpeg xfade | PORT | `docs/playbooks/editor/transitions.md` | ported |
| feedback_hyperframes_js_caption_font_empty_subset | JS-injected caption text → empty font subset → embed full woff2 base64 | PORT | `docs/playbooks/hyperframes.md` Hard-kills table | ported |
| feedback_modular_composition_build | hand-authored build-script comps: author modular from the start | PORT | `docs/playbooks/hyperframes.md` (authoring note) | ported |
| feedback_faceless_essay_pacing | cut visuals every 3-4.5s, zero static holds, caption chunks every 1-2s | PORT | `docs/playbooks/editor/transitions.md` (faceless pacing note) | ported |
| feedback_sticker_cutout_floodfill | flood-fill the flat bg to keep white die-cut outline; not u2net | PORT | `.agents/skills/hyperframes-media/SKILL.md` (bg-removal section) | ported |
| feedback_keyed_icon_luma_key_screen_blend | key flat-on-black icons by luma alpha under screen-blend, not colorkey | PORT-deferred | — | analog-horror-niche; lives in analog-horror-psa skill scope. Left local |
| feedback_frame_break_meta_hook | actor pushes letterbox bars apart → full-bleed "no limits" slam | PORT-deferred | — | strong but very niche hook; left local, candidate for a future format template |
| feedback_meme_header_tiktok_format | white 9:16 + 16:9 letterbox + static Helvetica meme-header | PORT-deferred | — | format-specific; future template (issue 058). Left local |
| feedback_vet_components_not_bulk_insert | vet each handed-off component vs constraints; don't bulk-insert | PORT-deferred | — | dev/handoff discipline; generalizable but soft. Left local |
| feedback_ytdlp_js_runtime_node | yt-dlp "no JS runtime" → `--js-runtimes node`; always pull the real video | PORT | `docs/playbooks/researcher.md` (or tool note) | ported |
| feedback_ralphy_ref_analyze_video | analyze video refs via `ralphy ref analyze-video`, not Read-on-frames | ALREADY-PUBLIC | researcher playbook + AGENTS invariant #2 (CLI-only LLM calls) | — | none |
| feedback_character_voice_design_previews_user_pick | 3 Voice-Design previews + user pick; clone isn't always better | PORT-deferred | — | workflow heuristic; agent-can't-hear nuance. Left local for now |
| feedback_texture_standard_regen_all | client sets exemplar → normalize WHOLE set; borderline = failed | PORT-deferred | — | client-workflow discipline; generalizable but soft. Left local |
| feedback_verify_sdk_before_code_creative | verify API surface (curl/SDK) before code-on-screen creatives | ALREADY-PUBLIC | `fb-creatives` skill site-grounding + AGENTS invariant #15 | — | none |
| feedback_site_grounding_before_brand_dna | crawl site (home+/docs+/pricing…) before brand-DNA | ALREADY-PUBLIC | AGENTS invariant #15 + `docs/playbooks/site-grounding.md` | — | none |
| feedback_anti_ad_vibe_dev_reels | dev-reel b-roll = real captures, never designed motion graphics | PORT-deferred | — | creator-ref-niche; future template overlay. Left local |
| feedback_no_visible_borders | never visible borders on UI; separate via bg-tint + shadow | LOCAL-ONLY | — | UI/landing aesthetic preference; not video-craft. Stays local |
| feedback_webapp_build_inline_not_agent | build web apps inline, not via sub-agent | LOCAL-ONLY | — | dev-workflow preference. Stays local |
| feedback_project_score_schema_drift | `ralphy project score` crashes on schema-conformant scenarios | LOCAL-ONLY | — | a bug; belongs in `notes/issues/`, not a craft port (point-in-time, may be fixed) |
| feedback_ps1_crunch_verb | `image crunch` verb (downscale→rgb565→nearest) for PS1 crunch | LOCAL-ONLY | — | uncommitted-verb state note; CLI-surface fact, not craft |
| feedback_commit_to_main | commit/push to main, no branch | LOCAL-ONLY | — | machine/harness preference |
| reference_git_remotes | push origin, never gitlab | LOCAL-ONLY | — | machine-specific remote config |
| reference_odindoma_deploy | prod VPS deploy flow + IP | LOCAL-ONLY | — | deploy creds / infra |
| reference_heygen_talking_photo_flow | HeyGen raw-API talking-photo flow | LOCAL-ONLY | — | off-stack provider + key; out of the OpenRouter+11labs invariant |
| reference_choose_channel_soundtrack | canonical music bed = hard-asset soundtrack.mp3 | LOCAL-ONLY | — | project-asset state |
| user_profile | user is a RU-speaking AI-tooling builder | LOCAL-ONLY | — | personal profile |
| project_ugc_pipeline | 7-skill pipeline overview | ALREADY-PUBLIC | the pipeline is the repo itself (playbooks/skills) | — | none |
| project_choose_path_compose_template | full choose-* end-to-end recipe | LOCAL-ONLY | — | project recipe + proxy IPs; niche, project-state |
| project_faceless_essay_kit | guide-choose-viral-001 caption-driven kit | LOCAL-ONLY | — | project kit state |
| project_guide_video_kit | 30-component guide DS build pattern | LOCAL-ONLY | — | project kit state |
| project_ship_style_template | Vercel-Ship-style announcement comp | LOCAL-ONLY | — | project-state + "next: extract" note |
| project_analog_horror_series | mirror PSA shipped + 3 scripted; CRT recipe | LOCAL-ONLY | — | series state; the generalizable CRT craft is in the analog-horror-psa skill |
| project_fogtown_cast | fogtown cast image-pack | LOCAL-ONLY | — | project cast library state |
| feedback_fogtown_sexy_ps1_anchor | preserve revealing source designs in PS1 re-skin | LOCAL-ONLY | — | universe-specific content direction |
| feedback_fogtown_juicy_hero_ps1_face | fogtown hero face direction | LOCAL-ONLY | — | universe-specific |
| project_free_air_stickerpack | blue mascot TG packs (current = 40 matte emotes) | LOCAL-ONLY | — | client project state |
| project_ralphy_stickerpack_idea | planned ghost-mascot TG pack | LOCAL-ONLY | — | idea/state |
| project_dianatolks_celebdecode | celebrity-decode carousel+reel format | LOCAL-ONLY | — | client project + voice-clone id |
| project_sotaocr_context_drop | 3 viral IG formats reproduced EN+DE | LOCAL-ONLY | — | client project state |
| project_ref3_greenscreen_format | cutout-over-screen-capture reel pipeline | LOCAL-ONLY | — | project recipe + HeyGen |
| project_landing_og_images | Next 15 App Router OG image gotchas | LOCAL-ONLY | — | landing-dev knowledge, not video-craft |
| project_bunny_media_storage | Supabase→Bunny media migration (SUPERSEDED) | LOCAL-ONLY | — | infra state, superseded |
| project_library_json_store | content library = static library.json | ALREADY-PUBLIC | `docs/developing-ralphy.md` template discipline | — | none |
| project_blueprint_and_recipe_tag_model | library Blueprint + recipe-vs-tag split | ALREADY-PUBLIC | `templater` skill + AGENTS invariant #10 | — | none |
| project_deep_research_engine | `ralphy research run` engine | ALREADY-PUBLIC | deep-research skill + CLI | — | none |
| project_desktop_app | Electron + embedded Claude Code | LOCAL-ONLY | — | separate app + billing detail |
| project_guideline_library | guidelines/ + `ralphy guideline` CLI | ALREADY-PUBLIC | this is the guidelines system itself | — | none |
| project_ralphy_new_vs_create_bug | `ralphy new` makes orphan dirs; use `project create` | LOCAL-ONLY | — | point-in-time CLI bug note |
| feedback_choose_path_no_telegraph_guide | each branch needs self-contained trap-logic | LOCAL-ONLY | — | choose-path-niche content direction |
| feedback_choosepath_hub_scrollstop | lit hub + names over heads + flashlight-on-heroes | LOCAL-ONLY | — | choose-path-niche |
| feedback_choosepath_target_duration | choose-* shorts ~1:00–1:10 | LOCAL-ONLY | — | choose-path-niche format rule |
| feedback_choosepath_vo_mix_discipline | lean, never-overlapping VO; timer windows speech-free | PORT-deferred | — | strong VO-mix discipline; partly general (no-overlap) but framed choose-path. Left local |
| feedback_choosepath_baked_decision_freeze | master has baked fork freezes; timer must sit on them | LOCAL-ONLY | — | choose-path-niche production detail |
| feedback_analog_horror_caption_white_glitch_tracking | white caps + GSAP chromatic flicker + tracking bands; keep blacks black | PORT-deferred | analog-horror-psa skill | left local — analog-horror-psa skill scope; the seek-determinism rule generalizes (captured via the multiscene-gating + GSAP note) |
| feedback_analog_horror_themed_sfx | regen themed sfx per PSA; reuse only VHS/CRT base | LOCAL-ONLY | analog-horror-psa skill | series-niche |
| feedback_analog_horror_unique_alert_code | unique bulletin code per PSA in a series | LOCAL-ONLY | analog-horror-psa skill | series-niche |

## Notes on the PORT-deferred bucket

These are real craft but either too niche to put in a general guideline today, or
already living in the matching content-niche skill (analog-horror-psa,
choose-path family) which is pending templatization (issue 058). When those
skills are converted to format templates, fold the deferred rows in there rather
than into a general guideline. The seek-determinism principle behind the
analog-horror caption rule (CSS `@keyframes` are NOT seek-captured; drive motion
via the paused GSAP timeline) IS general and is captured in the hyperframes
playbook Hard-kills addition.
