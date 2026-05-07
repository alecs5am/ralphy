# Reference-photo policy

**Hard rule (inherited from `AGENTS.md`):** named persona / brand / specific visual identity of a real entity → reference is required. Otherwise refuse.

## When the gate fires

A scenario.json slot contains:

- `persona.name = "Илон Маск"` (real name, not the `it-remote` archetype)
- `product = "Сбербанк"` / `brand = "Apple"` (branded object, logo, packaging)
- `style = "в стиле канала <X>"` where X is a real recognizable entity

## What we do

1. Check `workspace/projects/<id>/assets/uploaded/` for a matching ref:
   - persona-ref → face photo, ideally 2-3 angles
   - brand-ref → logo, website screenshot, packaging
   - style-ref → 3-5 screenshots of the target aesthetic

2. **If there's no reference — refuse:**

   > "Чтобы сделать `<имя/бренд>` хорошо, мне нужна референс-картинка. Скинь сюда фото / лого / скриншот, либо смени персонажа на безличного архетипа (`it-remote`, `courier`, `student`) — без референса генерить не буду, выйдет хуже чем дешёвый AI-слоп."

3. **If the user gives consent — we continue:**

   > "генерь без референса, я понимаю что качество будет хуже"

   Log to `user-prompts.jsonl`:
   ```ts
   logUserPrompt(id, { stage: "no-ref-consent", text: "<utterance>" })
   ```

## Using a reference in the prompt

When a reference exists:

- Copy the file to `assets/uploaded/<purpose>-<NN>.<ext>` (if it isn't there already).
- Log it via `logUserAsset(id, { kind: "photo", source, purpose: "persona-ref" })`.
- In `prompts.json` for each slot that should use the ref, set `image_urls: [...]`.
- During generation (gemini-3-pro-image-preview) — multi-ref is passed in `image_urls`.

## Brand consistency

For a brand on top of a reference logo, add to negative: "no logo distortion, no fake branding, no unauthorized brand modification". The logo only comes from the reference — we don't generate it.

## Known people

**No allowlist.** No list of "well-known" figures. Every name goes through the same gate. This directly avoids hallucinated likenesses.
