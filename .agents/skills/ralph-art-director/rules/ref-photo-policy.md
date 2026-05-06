# Reference-photo policy

**Hard rule (inherited from `AGENTS.md`):** именованная персона / бренд / специфическая визуальная идентичность реальной сущности → референс обязателен. Иначе refuse.

## Когда срабатывает gate

Слот scenario.json содержит:

- `persona.name = "Илон Маск"` (реальное имя, не архетип `it-remote`)
- `product = "Сбербанк"` / `brand = "Apple"` (брендированный объект, лого, упаковка)
- `style = "в стиле канала <X>"` где X — реальная узнаваемая сущность

## Что делаем

1. Проверь `workspace/projects/<id>/assets/uploaded/` на матчащий ref:
   - persona-ref → фото лица, желательно 2-3 ракурса
   - brand-ref → лого, скриншот сайта, упаковка
   - style-ref → 3-5 скринов целевой эстетики

2. **Если нет референса — refuse:**

   > "Чтобы сделать `<имя/бренд>` хорошо, мне нужна референс-картинка. Скинь сюда фото / лого / скриншот, либо смени персонажа на безличного архетипа (`it-remote`, `courier`, `student`) — без референса генерить не буду, выйдет хуже чем дешёвый AI-слоп."

3. **Если пользователь даёт consent — продолжаем:**

   > "генерь без референса, я понимаю что качество будет хуже"

   Логируем в `user-prompts.jsonl`:
   ```ts
   logUserPrompt(id, { stage: "no-ref-consent", text: "<utterance>" })
   ```

## Использование reference в промпте

Когда reference есть:

- Скопируй файл в `assets/uploaded/<purpose>-<NN>.<ext>` (если ещё не там).
- Залогируй через `logUserAsset(id, { kind: "photo", source, purpose: "persona-ref" })`.
- В `prompts.json` для каждого слота, который должен использовать ref, укажи `image_urls: [...]`.
- При генерации (gemini-3-pro-image-preview) — multi-ref передаётся в `image_urls`.

## Brand consistency

Для бренда поверх референс-лого добавь в negative: "no logo distortion, no fake branding, no unauthorized brand modification". Лого — только из референса, не генерируем.

## Известные нам люди

**Нет allowlist.** Нет списка "общеизвестных" фигур. Каждое имя проходит через тот же gate. Это прямо избегает галлюцинированных подобий.
