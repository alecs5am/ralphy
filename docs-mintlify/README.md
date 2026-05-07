# Ralphy docs · Mintlify

Source for [docs.ralphy.dev](https://docs.ralphy.dev). Hosted on
[Mintlify](https://mintlify.com).

## Local preview

```bash
npm i -g mint
cd docs-mintlify
mint dev
```

Mintlify serves on [http://localhost:3000](http://localhost:3000) by default and hot-reloads on
file changes.

## Layout

```
docs-mintlify/
  docs.json              ← Mintlify config (theme, nav, fonts)
  introduction.mdx
  quickstart.mdx
  concepts.mdx
  cli/
    overview.mdx
    setup.mdx
    project.mdx
    template.mdx
    profile.mdx
  authoring/
    skills.mdx
    templates.mdx
    profiles.mdx
  reference/
    models.mdx
    troubleshooting.mdx
```

## Deploy

1. Push this folder to the repo (already in main).
2. Connect the repo to Mintlify at [dashboard.mintlify.com](https://dashboard.mintlify.com).
3. Point Mintlify at `docs-mintlify/` as the docs root.
4. Add the custom domain `docs.ralphy.dev` in Mintlify → Domains.
5. Add the CNAME record at the registrar.

Every push to `main` redeploys.

## Brand tokens

The `docs.json` mirrors the landing page tokens:

- primary `#3DD8FF` (mascot cyan)
- background `#06090F` (deep ink)
- heading `Instrument Serif`, body `Onest`

If you tweak the landing palette, update `docs.json` to match.
