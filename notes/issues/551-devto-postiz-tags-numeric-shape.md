# 551 — dev.to publish via Postiz: send tags (numeric-value shape)

## Context

`ralphy publish --targets devto` (a #527 follow-up) now schedules/publishes an
`article` unit to dev.to through Postiz via `buildDevtoEntry`
(`cli/lib/publish/mapping.ts`). It sends `__type: "devto"`, `title`, an optional
`canonical`, and an optional uploaded `main_image`, and the publish/revise paths
rewrite inline image refs in the body to their uploaded Postiz URLs.

Tags are currently OMITTED. The Postiz cloud public API rejected the documented
`tags: [{ value: string, label: string }]` shape with:

    posts.0.settings.tags.0.value must be a number conforming to the specified constraints

The public docs (docs.postiz.com/public-api/providers/devto) describe `value` as
a string, but this cloud instance validates it as a number. Until the expected
shape is confirmed, tags are dropped so the post still schedules.

## Task

- Confirm the exact dev.to tag shape Postiz expects (numeric `value`? a plain
  string array? tag ids?) from the Postiz app source or a manual dashboard post.
- Re-enable tags in `buildDevtoEntry`, sourced from `manifest.article.tags`
  (cap 4), in the confirmed shape.
- Extend `tests/unit/publish-devto.test.ts` to assert the tag shape.

## Notes

Origin: project `ralphy-content-farm-article`, unit
`turn-coding-agent-into-content-farm` (2026-07-20). That article was scheduled to
dev.to without tags; the 4 tags (ai, devtools, productivity, video) were added
manually in the dev.to editor.
