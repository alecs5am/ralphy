// BlueprintPanel — the full-width "reproduce this unit end-to-end" section below
// the udetail grid. Renders the per-unit Blueprint (#074): the complete,
// copy-pasteable reproduction recipe across the six axes —
//   1. scenario / scene table   2. per-stage verbatim prompts
//   3. composition skeleton      4. model stack + params + cost
//   5. concrete recipes / effects 6. hard assets (downloadable)
//
// Server Component — everything here is selectable / downloadable text, so no
// client interactivity is needed (no "use client"). When `blueprint` is
// undefined the panel renders nothing: the page degrades to the ingredient list
// only (acceptance: graceful when a unit has no Blueprint yet).
//
// No visible borders: separation via bg-tint steps + shadow + spacing only.

import type {
  Blueprint,
  BlueprintAsset,
  BlueprintAssetKind,
} from "@/lib/library-v2/types";

const ASSET_GROUP_LABEL: Record<BlueprintAssetKind, string> = {
  character: "Characters",
  location: "Locations",
  prop: "Props",
  music: "Music",
  ref: "References",
  master: "Masters",
};

const ASSET_GROUP_ORDER: BlueprintAssetKind[] = [
  "master",
  "character",
  "location",
  "prop",
  "music",
  "ref",
];

function fmtUsd(n: number | undefined): string | undefined {
  if (n === undefined || Number.isNaN(n)) return undefined;
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

function fmtBytes(n: number | undefined): string | undefined {
  if (n === undefined || Number.isNaN(n)) return undefined;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function BlueprintPanel({ blueprint }: { blueprint?: Blueprint }) {
  if (!blueprint) return null;

  const { scenario, prompts, composition, modelStack, recipes, assets } = blueprint;

  const hasScenario =
    !!scenario && ((scenario.scenes?.length ?? 0) > 0 || !!scenario.storyboardMd);
  const hasPrompts = prompts.length > 0;
  const hasComposition =
    !!composition &&
    ((composition.components?.length ?? 0) > 0 ||
      (composition.timing?.A?.length ?? 0) > 0 ||
      (composition.timing?.SEG?.length ?? 0) > 0 ||
      !!composition.file);
  const hasModels = modelStack.length > 0;
  const hasRecipes = recipes.length > 0;
  const hasAssets = assets.length > 0;
  const hasOversize = (blueprint.oversizeSkipped?.length ?? 0) > 0;

  const cost = fmtUsd(blueprint.costRollupUsd);

  return (
    <section className="bp-section">
      <div className="container container-w-1760">
        <div className="bp-panel">
          <div className="bp-head">
            <p className="bp-eye">Blueprint · reproduction recipe</p>
            <h2>Reproduce this unit end-to-end</h2>
            <p className="bp-sub">
              Everything Ralphy ran to make this unit — the scene table, every
              verbatim prompt, the composition, the model stack, the recipes, and
              the hard assets. Selectable and copy-pasteable.
              {cost && (
                <>
                  {" "}
                  Total cost to reproduce: <span className="bp-cost">{cost}</span>.
                </>
              )}
            </p>
          </div>

          {/* 1 — Scenario / scene table */}
          {hasScenario && (
            <div className="bp-axis">
              <p className="bp-axis-label">Scenario</p>
              {scenario!.scenes && scenario!.scenes.length > 0 && (
                <div className="bp-table-wrap">
                  <table className="bp-table">
                    <thead>
                      <tr>
                        <th>Scene</th>
                        <th>Label</th>
                        <th>Dur</th>
                        <th>VO</th>
                        <th>SFX</th>
                        <th>Fork</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scenario!.scenes.map((s) => (
                        <tr key={s.id}>
                          <td className="bp-mono">{s.id}</td>
                          <td>{s.label ?? ""}</td>
                          <td className="bp-mono">
                            {s.durationSec !== undefined ? `${s.durationSec}s` : ""}
                          </td>
                          <td className="bp-vo">{s.vo ?? ""}</td>
                          <td className="bp-mono">{(s.sfx ?? []).join(", ")}</td>
                          <td>
                            {s.fork
                              ? `${s.fork.label}${
                                  s.fork.options?.length
                                    ? ` → ${s.fork.options.join(" / ")}`
                                    : ""
                                }`
                              : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {scenario!.storyboardMd && (
                <pre className="bp-pre bp-storyboard">{scenario!.storyboardMd}</pre>
              )}
            </div>
          )}

          {/* 2 — Prompts */}
          {hasPrompts && (
            <div className="bp-axis">
              <p className="bp-axis-label">Prompts</p>
              <div className="bp-prompts">
                {prompts.map((p, i) => (
                  <div key={`${p.stage}-${p.slot ?? i}`} className="bp-prompt">
                    <div className="bp-prompt-meta">
                      <span className="bp-tag bp-tag-stage">{p.stage}</span>
                      {p.slot && <span className="bp-tag">{p.slot}</span>}
                      {p.model && <span className="bp-tag bp-tag-model">{p.model}</span>}
                    </div>
                    <pre className="bp-pre">{p.text}</pre>
                    {p.slots && p.slots.length > 0 && (
                      <p className="bp-slots">
                        slots: {p.slots.map((t) => `{{${t}}}`).join(" · ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3 — Composition */}
          {hasComposition && (
            <div className="bp-axis">
              <p className="bp-axis-label">Composition</p>
              <div className="bp-comp">
                {composition!.components && composition!.components.length > 0 && (
                  <div className="bp-comp-block">
                    <p className="bp-comp-key">Components / registry blocks / overlays</p>
                    <div className="bp-pills">
                      {composition!.components.map((c) => (
                        <span key={c} className="bp-pill">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {composition!.timing?.A && composition!.timing.A.length > 0 && (
                  <div className="bp-comp-block">
                    <p className="bp-comp-key">Scene starts — A[]</p>
                    <pre className="bp-pre bp-pre-inline">
                      [{composition!.timing.A.join(", ")}]
                    </pre>
                  </div>
                )}
                {composition!.timing?.SEG && composition!.timing.SEG.length > 0 && (
                  <div className="bp-comp-block">
                    <p className="bp-comp-key">Segment durations — SEG[]</p>
                    <pre className="bp-pre bp-pre-inline">
                      [{composition!.timing.SEG.join(", ")}]
                    </pre>
                  </div>
                )}
                {composition!.file && (
                  <p className="bp-comp-note">
                    Composition file:{" "}
                    <span className="bp-mono">{composition!.file}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 4 — Model stack */}
          {hasModels && (
            <div className="bp-axis">
              <p className="bp-axis-label">Model stack</p>
              <div className="bp-table-wrap">
                <table className="bp-table">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Model</th>
                      <th>Key params</th>
                      <th>Voice</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelStack.map((m, i) => (
                      <tr key={`${m.stage}-${i}`}>
                        <td className="bp-mono">{m.stage}</td>
                        <td className="bp-mono">{m.model}</td>
                        <td className="bp-params">
                          {m.params && Object.keys(m.params).length > 0
                            ? Object.entries(m.params)
                                .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                                .join(" · ")
                            : ""}
                        </td>
                        <td className="bp-mono">{m.voiceId ?? ""}</td>
                        <td className="bp-mono">{fmtUsd(m.costUsd) ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5 — Recipes */}
          {hasRecipes && (
            <div className="bp-axis">
              <p className="bp-axis-label">Recipes</p>
              <div className="bp-prompts">
                {recipes.map((r, i) => (
                  <div key={`${r.name}-${i}`} className="bp-prompt">
                    <div className="bp-prompt-meta">
                      <span className="bp-tag bp-tag-stage">{r.kind}</span>
                      <span className="bp-tag">{r.name}</span>
                    </div>
                    {r.command && <pre className="bp-pre">{r.command}</pre>}
                    {r.params && Object.keys(r.params).length > 0 && (
                      <p className="bp-slots">
                        {Object.entries(r.params)
                          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6 — Hard assets */}
          {hasAssets && (
            <div className="bp-axis">
              <p className="bp-axis-label">Hard assets</p>
              {ASSET_GROUP_ORDER.map((kind) => {
                const group = assets.filter((a) => a.kind === kind);
                if (group.length === 0) return null;
                return (
                  <div key={kind} className="bp-asset-group">
                    <p className="bp-asset-group-label">{ASSET_GROUP_LABEL[kind]}</p>
                    <div className="bp-assets">
                      {group.map((a, i) => (
                        <AssetRow key={`${a.path}-${i}`} asset={a} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Oversize-skipped — surfaced, never hidden */}
          {hasOversize && (
            <div className="bp-axis">
              <p className="bp-axis-label">In the source project</p>
              <p className="bp-oversize-note">
                These payload files were too large for Storage and live in the source
                project, not here:
              </p>
              <ul className="bp-oversize-list">
                {blueprint.oversizeSkipped!.map((p) => (
                  <li key={p} className="bp-mono">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AssetRow({ asset }: { asset: BlueprintAsset }) {
  const bytes = fmtBytes(asset.bytes);
  if (asset.storageUrl) {
    return (
      <a className="bp-asset bp-asset-dl" href={asset.storageUrl} download>
        <span className="bp-asset-glyph" aria-hidden>
          ↓
        </span>
        <span className="bp-asset-main">
          <span className="bp-asset-name">{asset.slot ?? asset.path}</span>
          <span className="bp-asset-meta">
            {asset.path}
            {bytes ? ` · ${bytes}` : ""}
          </span>
        </span>
        <span className="bp-asset-action">Download</span>
      </a>
    );
  }
  return (
    <div className="bp-asset">
      <span className="bp-asset-glyph" aria-hidden>
        ◇
      </span>
      <span className="bp-asset-main">
        <span className="bp-asset-name">{asset.slot ?? asset.path}</span>
        <span className="bp-asset-meta">
          <span className="bp-mono">{asset.path}</span>
          {bytes ? ` · ${bytes}` : ""}
        </span>
      </span>
      <span className="bp-asset-note">in the source project</span>
    </div>
  );
}
