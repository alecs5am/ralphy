# 07 — Socials & Docs — Open Questions & Decisions

## Open questions

### Q-01: Mintlify or self-hosted docs?
**Context:** Mintlify is hosted, fast to ship, costs money on growth tiers. Self-hosted (Docusaurus, Nextra) is free and customizable but more work.
**Options:**
- A. Stay on Mintlify; pay if/when traffic justifies.
- B. Migrate to Nextra or Docusaurus before v1.0. More work; full control.
- C. Mintlify for v1.0; revisit at v2 if costs sting.
**Blocking:** all `07.02.x` and `07.03.x`.
**Owner:** user. Default lean: C.

### Q-02: Demo video — screencast or rendered Ralphy output?
**Context:** screencast shows the actual UX. A Ralphy-made video shows what Ralphy *makes*. They're different stories.
**Options:**
- A. Screencast only.
- B. Both — split-screen or sequential.
- C. Ralphy-made demo as hero, screencast as a secondary "how it works" video.
**Blocking:** `07.05.02`.
**Owner:** user. Default lean: B.

### Q-03: GitHub Discussions vs Discord
**Context:** Discussions is built into GitHub and lower-overhead. Discord is where OSS communities really hang out.
**Options:**
- A. Discussions only for v1.0.
- B. Both — Discord for chat, Discussions for searchable Q&A.
- C. Discord only — closer to where users already are.
**Blocking:** `07.08.x`.
**Owner:** user. Default lean: A.

### Q-04: Auto-generated reference — full or summarized?
**Context:** dumping every flag for every verb is comprehensive but noisy. A curated summary is friendlier but maintained.
**Options:**
- A. Full auto-dump (every flag, every example).
- B. Auto-summary (verb + 3 most common flags + 1 example); link to `--help` for full.
- C. Both — top-of-page summary, expandable "full reference" below.
**Blocking:** `07.03.01`.
**Owner:** user. Default lean: C.

### Q-05: README banner — hand-designed or Ralphy-generated?
**Context:** the current banner is hand-designed (commit `f62fc13`). A Ralphy-generated banner would be a great self-demo but might look weird.
**Options:**
- A. Keep hand-designed.
- B. Replace with Ralphy-generated for the v1.0 milestone.
- C. Hand-designed primary; show a Ralphy-generated alternative in a "made with Ralphy" gallery.
**Blocking:** `07.05.01`, `07.06.02`.
**Owner:** user. Default lean: A.

### Q-06: Press / launch — silent ship or coordinated?
**Context:** OSS launch can be quiet (just push the tag) or coordinated (HN post, X thread, Discord pre-announce).
**Options:**
- A. Silent ship; let organic traction happen.
- B. HN + X coordinated launch with screenshots and demo.
- C. Soft launch to 5 friendly users; coordinated launch 2 weeks later.
**Blocking:** none directly; informs which docs/copy are critical-path.
**Owner:** user.

---

## Decision log

*(empty — fill as questions resolve)*
