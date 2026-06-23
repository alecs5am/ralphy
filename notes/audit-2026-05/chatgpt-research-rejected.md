# Ralphy architecture (current state)

Ralphy is **a single repository** that combines an agent pipeline for creating UGC videos from one text brief. As described in the README, it implements a CLI pipeline using Remotion for composition and rendering, plus a set of AI agents (a "skill bundle"). The architecture glues together several external services: OpenRouter (a universal API for LLMs, image generation, video, recognition), ElevenLabs (for generating voice tracks and music), and a local job queue built on Bun and SQLite【7†L265-L273】. The simplest scenario: the user calls `ralphy new`, then a template/style clone, generates assets (images, audio), and runs `ralphy render`, getting an MP4. Inside Ralphy, **five sequential "sub-agents"** are involved (Idea, Prompt, Board, Render, Refine), each performing its own task (idea → conversion into frame prompts → storyboard → asset generation → refinement)【32†L268-L277】. All agents write data into a single workspace, which simplifies information exchange.

**Features of the current architecture:**
- *Multi-component:* the CLI utility manages a complex task graph (niche research, scenario generation, graphics and video creation, editing), "gluing" them together through agents and the queue.
- *Integrations:* OpenRouter is used to call various models (LLM, text-to-video, recognition), ElevenLabs for TTS/music, Remotion for video. Plus local utilities (ffmpeg and others) for auxiliary tasks.
- *Job queue:* Bun + SQLite serve as a simple queue/state store between steps. This is good for the local scenario, but at scale (a content farm) a more powerful broker may be required (e.g., Redis or Temporal).
- *Configurable rules:* Ralphy already includes "model-aware fallback" — routing rules that pick the generation model by content type (for example, the Kling model for UGC/selfie and Seedance for horror) based on a configuration (the MODELS.md file)【32†L330-L339】.
- *Installation:* prebuilt statically compiled binaries (for macOS, Linux, Windows) in one repository. The `install.sh` script / Brew / npm simplify deployment. According to the roadmap, Ralphy v1.0 should install a new system and produce a first video in **<15 minutes on a "clean" machine**【45†L1-L4】.

# User scenarios and requirements

Two main usage scenarios are reported:

- **Casual users:** want to quickly create a trending or advertising video ("UGC-style," TikTok/Reels) from a single brief. Their priority is **simplicity**: minimal input and edits, preloaded templates, clear CLI commands or a GUI. Tasks: fast trend research, a ready-made scenario, generation of stylish visuals and voice, automatic editing. Installation and operation on a local machine are mandatory, without complex setup.
- **Content farm (team):** industrial users generating dozens/hundreds of clips. They need **scalability** and automation: the ability to run projects in parallel, reuse templates, configure branding (logos, brand colors, voices), integrate analytics and a publishing schedule. Also important is monitoring API costs and quality (retrospective analysis of the best variants).

**Key features (as the customer formulated them):**
- Deep research of the niche and formats: Ralphy should parse TikTok/Reels/Shorts, identify current formats and hooks before generating video【32†L144-L153】.
- Automatic scriptwriting and content planning: LLM agents generate scripts, storyboards, and distribute frames across scenes (a 5-frame storyboard by default【32†L285-L294】).
- High-quality asset generation: an AI designer creates backgrounds/characters/animations (keyframes) and video clips (via text-to-video), audio accompaniment (voice, music). For quality, image-consistency mechanisms matter (e.g., character-consistency control) and the ability to swap models.
- Can edit: automatic scene editing via Remotion, plus subtitles, effects, color grading. The roadmap calls for "ffmpeg scripts, smart-crop, frame extraction" and even local models for voice capture (whisper.cpp)【52†L1-L4】.
- Simple installation/environment: one binary/script (`curl | sh`), portable to any machine, without manual setup. Possibly a Docker image for a server (content farm).

# Comparison with similar solutions and best practices

**Modular architecture:** Modern AI video and content pipelines strive for a plugin structure. An example is the open-source project Modular AI Video Generation (redditor *ExtremeKangaroo5437*)【20†L1-L4】【21†L1-L4】. There each stage (LLM, TTS, Text-to-Image, Image-to-Video, Text-to-Video) is implemented via abstract base classes (BaseLLM, BaseTTS, etc.), which makes it **easy to add new models**: it's enough to implement the interface, and the system automatically picks up the module【21†L1-L4】. Such an architecture eases extending Ralphy: for example, switching between different engines (Stable Diffusion, Sora, local models) or adding new voice providers.

**State and orchestration:** Ideally, the task flow can be represented as a DAG (Directed Acyclic Graph), where the nodes are operations (research, text generation, media generation, composition). A queue-management system (TaskExecutor) tracks project state via JSON or a DB, so that execution can be *stopped/resumed*. The aforementioned example implements a *stateful pipeline*: a "ProjectManager" stores progress, and a "TaskExecutor" runs the modules【20†L1-L4】. Ralphy currently uses SQLite, but for scaling a broker like Kafka/Redis or a workflow engine (e.g., Temporal) would fit.

**Jobs and models:** Ralphy's agents are already split into roles (researcher, scenarist, director, editor, producer). In the ideal variant these roles can be formalized into **plugin skills**, as indicated in `AGENTS.md` and `docs/playbooks` (routing requests to specific playbooks). It's also useful to provide *dynamic discovery of new models*, as in the example with the base classes: so that when a new AI module is added it doesn't need to be registered by hand — the system picks it up itself.

**Quality evaluation:** High-quality pipelines implement auto-checks and a return for rework. Ralphy already has the idea of "discarding failed frames before rendering" (scoreScenario/scoreImage block bad scenes【46†L1-L4】). Ideally, add several levels of checks: object segmentation, sharpness level, subtitle density, etc., as indicated in the roadmap (multi-pass evaluation)【32†L323-L332】. After rendering — an auto-critic or A/B testing, to "self-exclude" the worst variants (Multi-variant + Best-Pick in the roadmap【32†L342-L350】).

# The ideal Ralphy architecture

1. **Modularity and extensibility:** Each link (trend research, text generation, image/video generation, voiceover, editing) is designed as a separate **plugin/module** with a clearly defined input and output. Interfaces for text generation (LLM), audio (TTS), images and video (T2I, T2V), video and audio processing allow adding new models "on the fly." For example, using `BaseModel` classes and autoloading, any user can plug in local models (Stable Diffusion, Sora, Whisper, etc.) without changing the core.

2. **Orchestrator and state manager:** Instead of an ad-hoc SQLite queue, one can develop an orchestrator component (something like CrewAI or Bento4) that tracks the execution of project tasks. Such a **task manager** can store state (DB or JSON) and manage dependencies: for example, first finishing research → then scenario generation, and so on. This will allow "hot reload" and parallelism (several projects at once). It's possible to introduce a server-side part with a REST API (so teams can integrate Ralphy into their systems).

3. **Flow from idea to video:** Ideally the architecture can be represented as a **chain of agents:**
   - *Researcher:* parses trends (TikTok API, Reddit, Google Trends, etc.) and updates the reference base.
   - *Planner:* generates a content plan (how many scenes, which stylistic techniques) based on the trends.
   - *Scenarist:* builds a detailed scenario and storyboard (describes the image model and the on-screen actions).
   - *Generation conductor:* sequentially calls keyframe generation (T2I) and animation/video clips (I2V/T2V) by scene.
   - *Voiceover:* makes text prompts for the speech actors (ElevenLabs and others), generates voices, music, effects.
   - *Editor:* composes the video, overlays subtitles/effects via Remotion or ffmpeg.
   - *Critic:* evaluates the result (whether the ad is lively, the CG, subtitle readability) and loops back if necessary (auto-rendering retries).

   All these roles exchange data through a shared file structure (workspace) or a database. Such a microservice approach lets people in the community add their own modules (for example, a new way to generate a background) without changing the rest of the code.

4. **Quality and safety:**
   - *Strict filters:* "quality gates refuse, not warn"【46†L1-L4】 — don't let dead (no sound) or distorted frames through.
   - *Versioning and rollback:* save "reference renders" for regression tests (as planned in the roadmap【46†L7-L10】).
   - *Identity:* "Identity lock" — the ability to fix key images (product logo, brand colors) across scenes【32†L330-L339】.
   - *Telemetry:* log the time and cost of each step (the "Cost & Telemetry" category in the roadmap).

5. **Infrastructure and scaling:**
   - *Containerization:* release a Docker image for server use (on a team's local network) and a cloud version for heavy loads.
   - *Provider flexibility:* be able to switch between cloud (OpenAI/GCP/Azure) and local (Sora, HuggingFace) models per settings. This removes dependence on one provider and lets you use free models.
   - *Scale:* if it's about a "content farm," provide for orchestration (Kubernetes, Celery, n8n, etc.) to process many projects in parallel.

# CI/CD and reliable delivery

For a project with tens of thousands of stars to be attractive, **reliable CI/CD** and ease of building are critically important:

- **Automated build and testing:** Every commit goes through GitHub Actions (or another CI). Running unit and integration tests (`bun test`), linters (`bun run lint`, ESLint, TypeScript), and CLI smoke tests on various OSes (Linux, macOS, Windows). To check functionality, one can add tests that run `ralphy render` on a small template and compare the hashes of the output video or the option output (as planned in the roadmap "smoke tests per template"【46†L6-L10】).

- **Auto-release of releases:** When a tag/release is created, CI automatically packages and publishes the binaries to GitHub Releases (with SHA256SUMS) and to the Homebrew Tap and npm, as intended: "npm, brew, GitHub Releases are published from CI with one press"【43†L1-L4】. This eliminates manual work and guarantees that any participant can install Ralphy on a "clean machine" (criterion 7 of v1.0【43†L1-L4】).

- **Documentation and help:** CI can generate documentation (Mintlify or jsdoc) on commits and publish the site. It's also necessary to translate the important sections (CLAUDE.md, AGENTS.md, playbooks) into Russian/English (English at minimum), so that the new audience is productive within 30 minutes: "README → CLAUDE → AGENTS → playbook"【43†L1-L4】.

- **Version control and license:** It's essential to choose an open license (Apache/MIT) as soon as the functionality is stable. The current code has UNLICENSED【50†L1-L3】, which may scare off contributors. Switching to a popular license is one of the conditions for releasing v1.0.

# Roadmap and community

For growing popularity and stars it's important to clearly articulate the next milestone (Roadmap) and actively develop the community:

- **Clear goals (v1.0 and beyond):** There are already requirements for version 1.0 (fast start, reproducible templates, cost predictability, no "manual hacks"【45†L1-L4】【44†L1-L4】). On their basis it's worth building a public PRD: for example, by 1.0 to have several ready examples of "New Project → template → render = a working video" without edits.

- **Technical progress:** It's clear from the roadmap that there are groundwork items for improving UX, prompts, deep research, quality, and scalability. The categories "Prompts & Templates," "Skills," "Testing & Reliability," and "Deep research" need to be finished (or at least started)【35†L382-L391】. Open issues, discussions, and GitHub projects should reflect these tasks.

- **Community and contributors:** Create convenient venues (GitHub Discussions for Q&A and ideas, set up a CONTRIBUTING.md). Encourage pull requests: especially templates (`templates/`), new models (`MODELS.md`), and bugfixes. Regularly publish updates and examples so people can **copy and modify** ready projects (in the spirit of "fork & tweak start").

- **Examples and demos:** Publish released video examples (as there are now several ready renders on ralphy.dev) and explain how to achieve them. Quick success is the key to stars: when developers see "wrote one sentence — got a trending video — wow!" they happily star it.

- **Success summary:** The v1.0 criteria and beyond formalize trust: "auto-run without edits," "fixed template results"【45†L1-L4】【43†L1-L4】, "a full cycle from chat"【44†L1-L4】, "quality outputs." After 1.0, one can set ambitious features (multilingualism, GUI, offline mode).

# Conclusion

**The ideal Ralphy** is a platform with **a modular architecture of AI agents and plugins**, an automatic pipeline from idea to MP4, and a well-thought-out CI/CD infrastructure. It should be as easy to install and use as popular open-source CLI tools, while scaling from a single freelancer to a content-farm team. The project will attract stars and contributors if the following are available:
- **Full automation.** Without manual touch-up: the agent "decides itself" what and how to generate【44†L1-L4】. Auto-update of the best variants ("iterations by metrics").
- **Simplicity and transparency.** Clean documentation, ready examples, templates, and a convenient CLI that exactly matches the description【45†L1-L4】【43†L1-L4】.
- **Community.** An open license, active discussions, guides, and a readiness to accept PRs from the community (new video styles, models, scenarios).
- **Quality.** Strict video/audio checks ("score gates"【46†L1-L4】), stable repeatable results.
- **Reliable delivery.** Auto-releases via CI (brew, npm) with hash verification【43†L1-L4】, cross-platform builds, testing on a "clean" system.

By following these principles (modularity, automation, transparency, reliability) Ralphy can turn into **an open engine for creating video content** that will be in demand and loved by the community, and will also attract tens of thousands of GitHub stars.

**Sources:** The description of Ralphy's architecture and the v1.0 goals are taken from the official repository【7†L265-L273】【35†L343-L352】【44†L1-L4】【45†L1-L4】. Parallel solutions are illustrated by examples from open-source projects【20†L1-L4】【21†L1-L4】【32†L268-L277】【43†L1-L4】【46†L1-L4】【52†L1-L4】. These quotes show the current arrangement of Ralphy and best practices for designing AI pipelines.
