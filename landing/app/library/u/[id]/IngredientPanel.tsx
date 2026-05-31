"use client";

// IngredientPanel — the heart of the remix UX. The right column of the unit
// detail page. Shows the unit's provenance as editable SLOTS:
//   Template · Style · Format (single-value; Format is fixed)
//   Characters · Location · Props (multi, from assets grouped by sub)
//   Recipes (multi) · Audio (music asset + static pinned VO / Captions chips)
//
// "change" / "add" opens the SlotPicker (fitting blocks / describe / upload).
// A pick STAGES a swap in local state keyed by `${axisKey}::${blockId}`. Staged
// rows/chips turn vio-tinted with "⇄ swapped" + "revert"; unchanged stay pinned.
// Nothing commits server-side — the sticky commit bar opens the shared
// RemixModal with `ralphy remix <id> --set <axis>=<value> …` baked in (copy-only).

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Block, Format, Unit } from "@/lib/library-v2/types";
import { blockGlyph } from "../../_shared/blockMeta";
import { CloseIcon, OpenIcon, PinIcon, PlusIcon, RemixIcon, SwapIcon } from "../../_shared/icons";
import { RemixModal } from "../../_shared/RemixModal";
import type { RemixPayload, RemixSwap } from "../../_shared/types";
import { SlotPicker } from "../../_shared/SlotPicker";
import type { SlotChoice, SlotPickerState } from "../../_shared/SlotPicker";

// ── Resolved provenance + applicable lists handed down from the server page ───

export interface PanelProps {
  unit: Unit;
  format: Format | undefined;
  template?: Block;
  style?: Block;
  characters: Block[];
  locations: Block[];
  props: Block[];
  music: Block[];
  recipes: Block[];
  /** Fitting blocks per slot, precomputed server-side (the `applicable` lists). */
  applicable: {
    template: Block[];
    style: Block[];
    recipe: Block[];
    character: Block[];
    location: Block[];
    prop: Block[];
    music: Block[];
  };
}

type AxisKey = "template" | "style" | "recipe" | "character" | "location" | "prop" | "music";

interface StagedSwap {
  axis: string; // human label
  axisKey: AxisKey;
  choice: SlotChoice;
}

const AXIS_LABEL: Record<AxisKey, string> = {
  template: "Template",
  style: "Style",
  recipe: "Recipes",
  character: "Characters",
  location: "Location",
  prop: "Props",
  music: "Audio",
};

const AXIS_GLYPH: Record<AxisKey, string> = {
  template: "▦",
  style: "✸",
  recipe: "❉",
  character: "☻",
  location: "⌖",
  prop: "✛",
  music: "♪",
};

function choiceLabel(c: SlotChoice): string {
  if (c.type === "block") return c.block.name;
  if (c.type === "describe") return `“${c.text}”`;
  return "Your upload";
}
function choiceValue(c: SlotChoice): string {
  if (c.type === "block") return c.block.id;
  if (c.type === "describe") return `"${c.text}"`;
  return "@upload";
}
function choiceBlurb(c: SlotChoice): string {
  if (c.type === "block") return c.block.blurb;
  if (c.type === "describe") return "New — generated to brief";
  return "New — matched to your reference";
}

export function IngredientPanel(props: PanelProps) {
  const { unit, format, template, style, characters, locations, props: propAssets, music, recipes, applicable } = props;
  const router = useRouter();
  const [swaps, setSwaps] = useState<Record<string, StagedSwap>>({});
  const [picker, setPicker] = useState<
    | (SlotPickerState & { apply: (c: SlotChoice) => void })
    | null
  >(null);
  const [remix, setRemix] = useState<RemixPayload | null>(null);

  const swapList = useMemo(() => Object.entries(swaps), [swaps]);

  function keyFor(axisKey: AxisKey, blockId: string | null): string {
    return `${axisKey}::${blockId ?? "new"}`;
  }

  function openPicker(opts: {
    axisKey: AxisKey;
    block: Block | null;
    options: Block[];
    kindLabel: string;
    glyph: string;
  }) {
    const key = keyFor(opts.axisKey, opts.block ? opts.block.id : null);
    setPicker({
      axisLabel: AXIS_LABEL[opts.axisKey],
      kindLabel: opts.kindLabel,
      glyph: opts.glyph,
      current: opts.block ?? undefined,
      options: opts.options,
      apply: (choice) => {
        setSwaps((s) => ({
          ...s,
          [key]: { axis: AXIS_LABEL[opts.axisKey], axisKey: opts.axisKey, choice },
        }));
        setPicker(null);
      },
    });
  }

  function revert(key: string) {
    setSwaps((s) => {
      const n = { ...s };
      delete n[key];
      return n;
    });
  }

  // ── Commit bar ──────────────────────────────────────────────────────────────
  const pinnedTotal =
    2 /* template + style */ +
    1 /* format */ +
    characters.length +
    locations.length +
    propAssets.length +
    recipes.length +
    music.length;

  function openRemix() {
    let cli = `ralphy remix ${unit.id}`;
    const modalSwaps: RemixSwap[] = [];
    for (const [, s] of swapList) {
      cli += ` --set ${s.axisKey}=${choiceValue(s.choice)}`;
      modalSwaps.push({
        axis: s.axis,
        fromName: fromNameFor(s),
        toLabel: choiceLabel(s.choice),
      });
    }
    setRemix({
      tag: `@unit:${unit.id}`,
      cli,
      title: unit.title,
      eyebrow: swapList.length
        ? `Remix · ${swapList.length} swap${swapList.length > 1 ? "s" : ""} staged`
        : "Remix this unit",
      from: format ? `${format.label} · keeps everything you didn't touch` : undefined,
      thumb: format ? { glyph: format.glyph } : undefined,
      swaps: modalSwaps.length ? modalSwaps : undefined,
      swapHint: swapList.length
        ? undefined
        : "say what to swap (a character, a location, the style). Ralphy reads the unit's recipe and re-runs only what your swap touches, keeping the rest pinned.",
    });
  }

  // Resolve the "from" name for a staged swap (the block it replaces).
  function fromNameFor(s: StagedSwap): string {
    const allByAxis: Record<AxisKey, Block[]> = {
      template: template ? [template] : [],
      style: style ? [style] : [],
      recipe: recipes,
      character: characters,
      location: locations,
      prop: propAssets,
      music,
    };
    // The staged key encodes the original block id; recover it from the map key.
    const entry = swapList.find(([, v]) => v === s);
    const origId = entry ? entry[0].split("::")[1] : "new";
    const found = allByAxis[s.axisKey].find((b) => b.id === origId);
    return found ? found.name : "—";
  }

  const changedAxes = useMemo(() => {
    const set = new Set<string>();
    for (const [, s] of swapList) set.add(s.axis.toLowerCase());
    return [...set].join(", ");
  }, [swapList]);

  return (
    <>
      <div className="ipanel">
        <div className="ipanel-head">
          <p className="ih-eye">Ingredients · provenance</p>
          <h2>What made this unit</h2>
          <p>The exact blocks Ralphy composed. Swap any one — the rest stays pinned.</p>
        </div>

        {/* try-hints — the two required flows as one-tap chips */}
        <div className="tryrow">
          <button
            type="button"
            className="tryhint"
            onClick={() =>
              locations[0] &&
              openPicker({
                axisKey: "location",
                block: locations[0],
                options: applicable.location,
                kindLabel: "Location",
                glyph: AXIS_GLYPH.location,
              })
            }
          >
            <span className="tn">A</span> Try: change the Location
          </button>
          <button
            type="button"
            className="tryhint"
            onClick={() =>
              characters[0] &&
              openPicker({
                axisKey: "character",
                block: characters[0],
                options: applicable.character,
                kindLabel: "Character",
                glyph: AXIS_GLYPH.character,
              })
            }
          >
            <span className="tn">B</span> Try: swap a Character
          </button>
        </div>

        {/* single-value axes */}
        {template && (
          <SlotRow
            axis="Template"
            glyph="▦"
            block={template}
            swap={swaps[keyFor("template", template.id)]}
            onChange={() =>
              openPicker({ axisKey: "template", block: template, options: applicable.template, kindLabel: "Template", glyph: "▦" })
            }
            onRevert={() => revert(keyFor("template", template.id))}
            onOpenBlock={() => router.push(`/library/b/template/${template.id}`)}
          />
        )}
        {style && (
          <SlotRow
            axis="Style"
            glyph="✸"
            block={style}
            swap={swaps[keyFor("style", style.id)]}
            onChange={() =>
              openPicker({ axisKey: "style", block: style, options: applicable.style, kindLabel: "Style", glyph: "✸" })
            }
            onRevert={() => revert(keyFor("style", style.id))}
            onOpenBlock={() => router.push(`/library/b/style/${style.id}`)}
          />
        )}
        <SlotRow
          axis="Format"
          glyph={format?.glyph ?? "◐"}
          customGlyph={format?.glyph ?? "◐"}
          block={{
            kind: "template",
            id: "__format",
            name: format?.label ?? unit.format,
            blurb: `Defines the shape — ${unit.mediaCount} ${format?.unit ?? "item"}. Change the format = a different unit.`,
          }}
          fixed
        />

        <div className="slot-divider" />

        <MultiSlot
          axis="Characters"
          glyph="☻"
          blocks={characters}
          swaps={swaps}
          axisKey="character"
          onChangeItem={(b) =>
            openPicker({ axisKey: "character", block: b, options: applicable.character, kindLabel: "Character", glyph: "☻" })
          }
          onRevertItem={(id) => revert(keyFor("character", id))}
          onAdd={() =>
            openPicker({ axisKey: "character", block: null, options: applicable.character, kindLabel: "Character", glyph: "☻" })
          }
          onOpenBlock={(b) => router.push(`/library/b/asset/${b.id}`)}
        />
        <MultiSlot
          axis="Location"
          glyph="⌖"
          blocks={locations}
          swaps={swaps}
          axisKey="location"
          onChangeItem={(b) =>
            openPicker({ axisKey: "location", block: b, options: applicable.location, kindLabel: "Location", glyph: "⌖" })
          }
          onRevertItem={(id) => revert(keyFor("location", id))}
          onAdd={() =>
            openPicker({ axisKey: "location", block: null, options: applicable.location, kindLabel: "Location", glyph: "⌖" })
          }
          onOpenBlock={(b) => router.push(`/library/b/asset/${b.id}`)}
        />
        <MultiSlot
          axis="Props"
          glyph="✛"
          blocks={propAssets}
          swaps={swaps}
          axisKey="prop"
          onChangeItem={(b) =>
            openPicker({ axisKey: "prop", block: b, options: applicable.prop, kindLabel: "Prop", glyph: "✛" })
          }
          onRevertItem={(id) => revert(keyFor("prop", id))}
          onAdd={() =>
            openPicker({ axisKey: "prop", block: null, options: applicable.prop, kindLabel: "Prop", glyph: "✛" })
          }
          onOpenBlock={(b) => router.push(`/library/b/asset/${b.id}`)}
        />

        <div className="slot-divider" />

        <MultiSlot
          axis="Recipes"
          glyph="❉"
          blocks={recipes}
          swaps={swaps}
          axisKey="recipe"
          onChangeItem={(b) =>
            openPicker({ axisKey: "recipe", block: b, options: applicable.recipe, kindLabel: "Recipe", glyph: "❉" })
          }
          onRevertItem={(id) => revert(keyFor("recipe", id))}
          onAdd={() =>
            openPicker({ axisKey: "recipe", block: null, options: applicable.recipe, kindLabel: "Recipe", glyph: "❉" })
          }
          onOpenBlock={(b) => router.push(`/library/b/recipe/${b.id}`)}
        />
        <MultiSlot
          axis="Audio · music"
          glyph="♪"
          blocks={music}
          swaps={swaps}
          axisKey="music"
          onChangeItem={(b) =>
            openPicker({ axisKey: "music", block: b, options: applicable.music, kindLabel: "Music", glyph: "♪" })
          }
          onRevertItem={(id) => revert(keyFor("music", id))}
          onAdd={() =>
            openPicker({ axisKey: "music", block: null, options: applicable.music, kindLabel: "Music", glyph: "♪" })
          }
          onOpenBlock={(b) => router.push(`/library/b/asset/${b.id}`)}
        />
        {/* static pinned audio chips */}
        <div className="slot-multi" style={{ paddingTop: 0 }}>
          <span className="bchip sm" style={{ cursor: "default" }}>
            <span className="bg">▤</span>
            <span className="bk">VO</span>
            <span className="bn">Auto narration</span>
          </span>
          <span className="bchip sm" style={{ cursor: "default" }}>
            <span className="bg">⌯</span>
            <span className="bk">Captions</span>
            <span className="bn">Burned-in</span>
          </span>
        </div>

        {/* commit bar */}
        <div className="commit">
          <div className="commit-row">
            <button type="button" className="btn-remix btn-remix-full" onClick={openRemix}>
              <RemixIcon s={16} />{" "}
              {swapList.length
                ? `Remix with ${swapList.length} swap${swapList.length > 1 ? "s" : ""}`
                : "Remix this"}
            </button>
          </div>
          {swapList.length > 0 ? (
            <p className="summary">
              Keeping <b>{pinnedTotal - swapList.length} pinned</b> · changing <b>{changedAxes}</b>.
            </p>
          ) : (
            <p className="summary">
              Or start fresh from one block —{" "}
              {template && (
                <a href={`/library/b/template/${template.id}`} style={{ color: "var(--vio-2)" }}>
                  use the template
                </a>
              )}
              {template && style && " · "}
              {style && (
                <a href={`/library/b/style/${style.id}`} style={{ color: "var(--vio-2)" }}>
                  use this style
                </a>
              )}
              .
            </p>
          )}
        </div>
      </div>

      <SlotPicker
        state={picker}
        onClose={() => setPicker(null)}
        onPick={(c) => picker?.apply(c)}
      />
      <RemixModal payload={remix} onClose={() => setRemix(null)} />
    </>
  );
}

// ── One single-value slot row ───────────────────────────────────────────────────

function SlotRow({
  axis,
  glyph,
  block,
  swap,
  onChange,
  onRevert,
  onOpenBlock,
  fixed,
  customGlyph,
}: {
  axis: string;
  glyph: string;
  block: Block;
  swap?: StagedSwap;
  onChange?: () => void;
  onRevert?: () => void;
  onOpenBlock?: () => void;
  fixed?: boolean;
  customGlyph?: string;
}) {
  const display = swap ? choiceLabel(swap.choice) : block.name;
  const blurb = swap ? choiceBlurb(swap.choice) : block.blurb;
  const thumbGlyph =
    customGlyph ?? (swap && swap.choice.type === "block" ? blockGlyph(swap.choice.block) : blockGlyph(block));

  return (
    <div className={`slot${swap ? " swapped" : ""}`}>
      <div className="slot-axis">
        <span className="ax">
          <span className="g">{glyph}</span>
          {axis}
        </span>
      </div>
      <span className="slot-thumb glyphy">{thumbGlyph}</span>
      <div className="slot-main">
        <div className="sn">
          {onOpenBlock && !swap ? (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onOpenBlock();
              }}
            >
              {display}
            </a>
          ) : (
            display
          )}
        </div>
        <div className="sm">{blurb}</div>
      </div>
      <div className="slot-state">
        {swap ? (
          <>
            <span className="swappill">
              <SwapIcon s={11} /> swapped
            </span>
            <button type="button" className="slot-revert" onClick={onRevert}>
              revert
            </button>
          </>
        ) : fixed ? (
          <span className="pinpill">
            <PinIcon /> fixed
          </span>
        ) : (
          <>
            <span className="pinpill">
              <PinIcon /> pinned
            </span>
            <button type="button" className="slot-change" onClick={onChange}>
              change
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── A multi-value axis (characters / props / recipes / audio) ───────────────────

function MultiSlot({
  axis,
  glyph,
  blocks,
  swaps,
  axisKey,
  onChangeItem,
  onRevertItem,
  onAdd,
  onOpenBlock,
}: {
  axis: string;
  glyph: string;
  blocks: Block[];
  swaps: Record<string, StagedSwap>;
  axisKey: AxisKey;
  onChangeItem: (b: Block) => void;
  onRevertItem: (id: string) => void;
  onAdd: () => void;
  onOpenBlock?: (b: Block) => void;
}) {
  return (
    <div>
      <div className="slot-grouphead">
        <span style={{ fontFamily: "var(--font-display)", color: "var(--block-ink)", marginRight: 6 }}>
          {glyph}
        </span>
        {axis}
      </div>
      <div className="slot-multi">
        {blocks.length === 0 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--mute-2)" }}>
            none —
          </span>
        )}
        {blocks.map((b) => {
          const sw = swaps[`${axisKey}::${b.id}`];
          const name = sw ? choiceLabel(sw.choice) : b.name;
          return (
            <span
              key={b.id}
              className="bchip"
              style={sw ? { background: "color-mix(in oklch, var(--vio) 16%, var(--bg-2))" } : undefined}
              role="group"
            >
              <button
                type="button"
                onClick={() => onChangeItem(b)}
                title="Change this"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  background: "none",
                  border: 0,
                  color: "inherit",
                  cursor: "pointer",
                  padding: 0,
                  font: "inherit",
                }}
              >
                <span className="bg" style={sw ? { color: "var(--vio-2)" } : undefined}>
                  {sw ? <SwapIcon s={12} /> : blockGlyph(b)}
                </span>
                <span className="bn">{name}</span>
              </button>
              {sw ? (
                <button
                  type="button"
                  className="fp-x"
                  style={{ width: 16, height: 16 }}
                  onClick={() => onRevertItem(b.id)}
                  aria-label="Revert"
                >
                  <CloseIcon s={10} />
                </button>
              ) : (
                onOpenBlock && (
                  <button
                    type="button"
                    className="fp-x"
                    style={{ width: 16, height: 16, background: "transparent", color: "var(--mute)" }}
                    onClick={() => onOpenBlock(b)}
                    aria-label="Open block"
                  >
                    <OpenIcon s={11} />
                  </button>
                )
              )}
            </span>
          );
        })}
        <button
          type="button"
          className="addfilter"
          style={{ padding: "5px 11px", fontSize: 11.5 }}
          onClick={onAdd}
        >
          <PlusIcon s={12} /> change · add
        </button>
      </div>
    </div>
  );
}
