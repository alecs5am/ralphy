# gsap.utils for HyperFrames

> Vendored from the official [greensock/gsap-skills](https://github.com/greensock/gsap-skills) `gsap-utils` skill (MIT, upstream commit `aed9cfd`), adapted for HyperFrames compositions.

## HyperFrames adaptation rules

- **gsap.utils** are pure helpers; no registration needed. Use them at timeline-build time to compute values, staggers, and distributions.
- **random() and determinism.** `gsap.utils.random()` / the `"random(...)"` string form evaluate once per target at first render — stable within one render pass, but **preview and render will differ**, and re-renders won't reproduce. For motion that must be reproducible (and diffable across `compositions/v<N>.html` snapshots), precompute values into a literal array at authoring time instead. `random()` is acceptable only for noise-like effects where exact values don't matter.
- **No scroll/pointer handlers.** Upstream examples that feed `mapRange`/`clamp` from mousemove or scroll do not apply; the input in HyperFrames is the timeline playhead.

## Overview

**Omitting the value: function form.** Many utils accept the value to transform as the **last** argument. If you omit that argument, the util returns a **function** that accepts the value later — useful when applying the same config across many targets. **Exception: random()** — pass **true** as the last argument to get a reusable function.

```javascript
// With value: returns the result
gsap.utils.clamp(0, 100, 150); // 100

// Without value: returns a function you call with the value later
let c = gsap.utils.clamp(0, 100);
c(150);  // 100
c(-10);  // 0
```

## Clamping and Ranges

### clamp(min, max, value?)

Constrains a value between min and max.

```javascript
gsap.utils.clamp(0, 100, 150); // 100
gsap.utils.clamp(0, 100, -10); // 0
```

### mapRange(inMin, inMax, outMin, outMax, value?)

Maps a value from one range to another. Use when converting progress (0–1), beat index, or audio amplitude data to an animation range.

```javascript
gsap.utils.mapRange(0, 100, 0, 500, 50);  // 250
gsap.utils.mapRange(0, 1, 0, 360, 0.5);   // 180 (progress to degrees)
```

### normalize(min, max, value?)

Returns a value normalized to 0–1 for the given range.

```javascript
gsap.utils.normalize(0, 100, 50);   // 0.5
gsap.utils.normalize(100, 300, 200); // 0.5
```

### interpolate(start, end, progress?)

Interpolates between two values at a given progress (0–1). Handles numbers, colors, and objects with matching keys.

```javascript
gsap.utils.interpolate(0, 100, 0.5);                    // 50
gsap.utils.interpolate("#ff0000", "#0000ff", 0.5);      // mid color
gsap.utils.interpolate({ x: 0, y: 0 }, { x: 100, y: 50 }, 0.5); // { x: 50, y: 25 }
```

## Random and Snap

### random(minimum, maximum[, snapIncrement, returnFunction]) / random(array[, returnFunction])

Returns a random number in the range, or a random element from an **array**. Optional **snapIncrement** snaps the result to the nearest multiple. **To get a reusable function**, pass **true** as the last argument. See the determinism rule at the top before using.

```javascript
gsap.utils.random(-100, 100);        // e.g. 42.7
gsap.utils.random(0, 500, 5);        // 0-500, snapped to nearest 5
gsap.utils.random(["red", "blue", "green"]);  // one of the three

let randomFn = gsap.utils.random(-200, 500, 10, true);
randomFn();  // new random value each call
```

**String form in tween vars** (evaluated per target):

```javascript
tl.to(".box", { x: "random(-100, 100, 5)", duration: 1 }, 0);
tl.to(".item", { backgroundColor: "random([red, blue, green])" }, 0);
```

### snap(snapTo, value?)

Snaps a value to the nearest multiple of **snapTo**, or to the nearest value in an array.

```javascript
gsap.utils.snap(10, 23);             // 20
gsap.utils.snap(0.25, 0.7);          // 0.75
gsap.utils.snap([0, 100, 200], 150); // nearest in array
```

Use in tweens for grid or step-based animation:

```javascript
tl.to(".x", { x: 200, snap: { x: 20 } }, 0);
```

### shuffle(array)

Returns the array with elements in random order (same determinism caveat as random()).

```javascript
gsap.utils.shuffle([1, 2, 3, 4]); // e.g. [3, 1, 4, 2]
```

### distribute(config)

**Returns a function** that assigns a value to each target based on its position in the array (or in a grid). Use whenever values should spread across many elements (scale, opacity, x, delay) — the workhorse for grid/cascade beats in compositions. The returned function receives `(index, target, targets)`; pass it directly as a tween value.

**Config (all optional):**

| Property | Type | Description |
|----------|------|-------------|
| `base` | Number | Starting value. Default `0`. |
| `amount` | Number | Total to distribute across all targets (added to base). |
| `each` | Number | Amount to add between each target (added to base). Use instead of `amount` for a fixed step. |
| `from` | Number \| String \| Array | Where distribution starts: index, or `"start"`, `"center"`, `"edges"`, `"random"`, `"end"`, or ratios like `[0.25, 0.75]`. Default `0`. |
| `grid` | String \| Array | Use grid position instead of flat index: `[rows, columns]` or `"auto"`. |
| `axis` | String | For grid: limit to one axis (`"x"` or `"y"`). |
| `ease` | Ease | Distribute values along an ease curve (e.g. `"power1.inOut"`). Default `"none"`. |

```javascript
// Scale: middle elements 0.5, outer edges 3 (amount 2.5 distributed from center)
tl.to(".cell", {
  scale: gsap.utils.distribute({ base: 0.5, amount: 2.5, from: "center" })
}, 0);
```

More: https://gsap.com/docs/v3/GSAP/UtilityMethods/distribute/

## Units and Parsing

### getUnit(value)

Returns the unit string of a value (e.g. `"px"`, `"%"`, `"deg"`).

```javascript
gsap.utils.getUnit("100px");   // "px"
gsap.utils.getUnit(42);        // "" (unitless)
```

### unitize(value, unit)

Appends a unit to a number, or returns the value as-is if it already has a unit.

```javascript
gsap.utils.unitize(100, "px");    // "100px"
gsap.utils.unitize("2rem", "px"); // "2rem" (unchanged)
```

### splitColor(color, returnHSL?)

Converts a color string into **[r, g, b]** (0–255) or **[r, g, b, a]**. Pass **true** as second argument for **[h, s, l]** / **[h, s, l, a]**. Works with rgb()/rgba()/hsl()/hsla()/hex/named colors. Use when animating color components or building gradients.

```javascript
gsap.utils.splitColor("#6fb936");                 // [111, 185, 54]
gsap.utils.splitColor("rgba(204, 153, 51, 0.5)"); // [204, 153, 51, 0.5]
gsap.utils.splitColor("#6fb936", true);           // [94, 55, 47] (HSL)
```

## Arrays and Collections

### toArray(value, scope?)

Converts a value to an array: selector string, NodeList, HTMLCollection, single element, or array.

```javascript
gsap.utils.toArray(".item");            // array of elements
gsap.utils.toArray(".item", container); // scoped to container
```

### selector(scope)

Returns a scoped selector function that finds elements only within the given element. Useful for scoping per-scene selectors inside a multi-scene composition's scene divs.

```javascript
const q = gsap.utils.selector(sceneEl);
tl.to(q(".caption"), { y: 0, opacity: 1 }, 2);
```

### pipe(...functions)

Composes functions: **pipe(f1, f2, f3)(value)** returns f3(f2(f1(value))).

```javascript
const fn = gsap.utils.pipe(
  (v) => gsap.utils.normalize(0, 100, v),
  (v) => gsap.utils.snap(0.1, v)
);
fn(50); // normalized then snapped
```

### wrap(min, max, value?)

Wraps a value into the range min–max (inclusive min, exclusive max). Use for cyclic values (e.g. hue rotation, looping marquee offsets — with finite repeats).

```javascript
gsap.utils.wrap(0, 360, 370);  // 10
gsap.utils.wrap(0, 360, -10);  // 350
```

### wrapYoyo(min, max, value?)

Wraps value in range with a yoyo (bounces at ends).

```javascript
gsap.utils.wrapYoyo(0, 100, 150); // 50 (bounces back)
```

## Best practices

- Omit the value argument to get a reusable function when the same range/config is used across many targets.
- Use **distribute()** for grid/cascade value spreads; **snap** for step-based values; **toArray** when a real array is needed from a selector.
- Use **gsap.utils.selector(scope)** to scope selectors to a scene div in multi-scene compositions.

## Do Not

- Assume **mapRange** / **normalize** handle units; they work on numbers. Use **getUnit** / **unitize** when units matter.
- Use random()/shuffle() where the exact result must reproduce across preview, render, and re-render — precompute literal values instead.

## Learn More

https://gsap.com/docs/v3/HelperFunctions
