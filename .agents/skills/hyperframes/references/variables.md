# HyperFrames variables (parametrized compositions)

> Moved out of `SKILL.md` to keep the skill body small (#574). Read on demand.

## Variables (Parametrized Compositions)

Render the same composition with different content — title, theme color, prices, captions — without editing the source HTML.

**Three-step pattern:**

1. **Declare** variables on the composition's `<html>` root with `data-composition-variables`. Each entry needs `id`, `type` (one of `string`, `number`, `color`, `boolean`, `enum`), `label`, and `default`. Enum entries also need `options: [{value, label}, ...]`.
2. **Read** the resolved values inside the composition's script with `window.__hyperframes.getVariables()`. Returns the merged result of declared defaults + per-instance overrides + CLI overrides.
3. **Override** at render time with `npx hyperframes render --variables '{...}'` (top-level) or with `data-variable-values='{...}'` on the host element (per-instance for sub-comps).

```html
<!doctype html>
<html
  data-composition-variables='[
  {"id":"title","type":"string","label":"Title","default":"Hello"},
  {"id":"theme","type":"enum","label":"Theme","default":"light","options":[
    {"value":"light","label":"Light"},
    {"value":"dark","label":"Dark"}
  ]}
]'
>
  <body>
    <div data-composition-id="root" data-width="1920" data-height="1080">
      <h1 id="hero" class="clip" data-start="0" data-duration="3"></h1>
      <script>
        const { title, theme } = window.__hyperframes.getVariables();
        document.getElementById("hero").textContent = title;
        document.body.dataset.theme = theme;
      </script>
    </div>
  </body>
</html>
```

```bash
# Dev preview uses declared defaults
npx hyperframes preview

# Render with overrides
npx hyperframes render --variables '{"title":"Q4 Report","theme":"dark"}' --output q4.mp4

# Or from a JSON file
npx hyperframes render --variables-file ./vars.json
```

**Sub-composition per-instance values:** the same `getVariables()` works inside sub-comps loaded via `data-composition-src`. Each host element passes its own values:

```html
<div
  data-composition-id="card-pro"
  data-composition-src="compositions/card.html"
  data-variable-values='{"title":"Pro","price":"$29"}'
></div>
<div
  data-composition-id="card-enterprise"
  data-composition-src="compositions/card.html"
  data-variable-values='{"title":"Enterprise","price":"Custom"}'
></div>
```

The runtime layers each host's `data-variable-values` over the sub-comp's declared defaults on a per-instance basis, so the same source can be embedded multiple times with different content.

**Rules of thumb:**

- Always provide a sensible `default` for every declared variable. Dev preview uses defaults — without them, the composition won't render correctly until `--variables` is provided.
- Read variables once at the top of the script (`const { title } = ...`), not inside frame loops or event handlers — `getVariables()` allocates a fresh object per call.
- Use `--strict-variables` in CI to fail fast on undeclared keys or type mismatches.
- Variable types are validated at render time. `string`, `number`, `boolean`, and `color` (hex string) check `typeof`; `enum` checks the value is in the declared `options`.
