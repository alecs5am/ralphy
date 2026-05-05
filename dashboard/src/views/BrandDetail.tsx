import { useEffect, useState } from "react";
import { ERA, MONO, SANS, DISPLAY } from "../era/tokens";
import {
  Btn,
  Chip,
  Cross,
  Crosses,
  CrossedGrid,
  PlaceholderImg,
  SectionHead,
  Spec,
  StatusBadge,
} from "../era/components";
import {
  WandIcon,
  PlusIcon,
  ExternalIcon,
} from "../era/icons";
import { Lightbox } from "../components/Lightbox";

export function BrandDetail({ brandId }: { brandId: string }) {
  const [brand, setBrand] = useState<any>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/brands/${brandId}`)
      .then((r) => r.json())
      .then(setBrand)
      .catch(() => {});
  }, [brandId]);

  if (!brand) {
    return (
      <div
        className="h-full flex items-center justify-center text-[12px]"
        style={{ color: ERA.mute }}
      >
        loading…
      </div>
    );
  }

  const palette = extractPalette(brand);

  const typography: any[] = normalizeTypography(brand);
  const screenshots: string[] = brand.screenshots || [];

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: ERA.bg, color: ERA.ink, ...SANS }}
    >
      <header
        className="relative px-8 pt-8 pb-6"
        style={{ borderBottom: `1px solid ${ERA.rule}` }}
      >
        <Crosses size={10} />
        <div
          className="flex items-baseline gap-3 text-[10px] uppercase tracking-[0.22em] mb-3"
          style={{ color: ERA.mute, ...MONO }}
        >
          <span>brand</span>
          <span>—</span>
          <span>{brand.id}</span>
          {brand.url && (
            <>
              <span>—</span>
              <span>{brand.url}</span>
            </>
          )}
        </div>
        <h1 className="text-[64px] leading-[0.95]" style={{ ...DISPLAY }}>
          {brand.name || brand.id}
        </h1>
        <div className="mt-4 flex items-center gap-2">
          <Btn icon={<WandIcon size={11} />}>generate from url</Btn>
          <Btn icon={<PlusIcon size={11} />}>add reference</Btn>
          {brand.url && (
            <Btn
              kind="bare"
              icon={<ExternalIcon size={11} />}
              href={brand.url.startsWith("http") ? brand.url : `https://${brand.url}`}
            >
              {brand.url}
            </Btn>
          )}
        </div>
      </header>

      <div className="p-8 grid grid-cols-12 gap-8">
        <div className="col-span-7">
          <SectionHead
            section="01"
            title="palette"
            right={`${palette.length} colors`}
          />
          {palette.length > 0 ? (
            <CrossedGrid cols={Math.max(1, palette.length)}>
              {palette.map((c, i) => (
                <div
                  key={c.hex + i}
                  className="relative"
                  style={{
                    borderRight:
                      i < palette.length - 1 ? `1px solid ${ERA.rule}` : "none",
                  }}
                >
                  <Cross corner="tl" />
                  <Cross corner="tr" />
                  <Cross corner="bl" />
                  <Cross corner="br" />
                  <div style={{ background: c.hex, height: 180 }} />
                  <div
                    className="p-3 text-[10px] space-y-0.5"
                    style={{
                      ...MONO,
                      borderTop: `1px solid ${ERA.rule}`,
                    }}
                  >
                    <div>{String(c.hex).toUpperCase()}</div>
                    <div style={{ color: ERA.mute }}>{c.label}</div>
                  </div>
                </div>
              ))}
            </CrossedGrid>
          ) : (
            <div
              className="px-6 py-8 text-center text-[12px]"
              style={{ border: `1px solid ${ERA.rule}`, color: ERA.mute }}
            >
              no palette tokens
            </div>
          )}

          {typography.length > 0 && (
            <div className="mt-10">
              <SectionHead
                section="02"
                title="typography"
                right={`${typography.length} families`}
              />
              <div style={{ border: `1px solid ${ERA.rule}` }}>
                {typography.map((t: any, i: number) => (
                  <div
                    key={(t.family || "f") + i}
                    className="p-6 grid grid-cols-12 items-end gap-4"
                    style={{
                      borderTop: i ? `1px solid ${ERA.rule}` : "none",
                    }}
                  >
                    <div
                      className="col-span-3 text-[10px]"
                      style={{ color: ERA.mute, ...MONO }}
                    >
                      {String(i + 1).padStart(2, "0")} · {t.usage || "—"}
                    </div>
                    <div
                      className="col-span-6 text-[36px]"
                      style={{
                        fontFamily: `'${t.family}', serif`,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {t.family}
                    </div>
                    <div className="col-span-3 flex flex-wrap gap-1 justify-end">
                      {(t.weights || []).map((w: string) => (
                        <Chip key={w} size="sm">
                          {String(w).toLowerCase()}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {screenshots.length > 0 && (
            <div className="mt-10">
              <SectionHead
                section="03"
                title="screenshots"
                right={`${screenshots.length} captures`}
              />
              <div
                className="grid grid-cols-3 gap-px"
                style={{
                  background: ERA.rule,
                  border: `1px solid ${ERA.rule}`,
                }}
              >
                {screenshots.map((s, i) => {
                  const url = `/media/${s}`;
                  const name = s.split("/").pop() || s;
                  return (
                    <button
                      key={s}
                      onClick={() => setLightboxIndex(i)}
                      className="bg-white p-2 relative text-left"
                    >
                      <Cross corner="tl" size={6} />
                      <Cross corner="tr" size={6} />
                      <Cross corner="bl" size={6} />
                      <Cross corner="br" size={6} />
                      <PlaceholderImg
                        palette={palette.map((p) => p.hex)}
                        ratio="4/3"
                        src={url}
                        label={name}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <aside className="col-span-5">
          <SectionHead section="meta" title="brand specs" />
          <table className="w-full" style={{ ...MONO, fontSize: 11 }}>
            <tbody>
              <Spec k="id" v={brand.id} />
              {brand.slug && <Spec k="slug" v={brand.slug} />}
              {brand.url && <Spec k="url" v={brand.url} />}
              <Spec k="palette" v={`${palette.length} colors`} />
              <Spec k="type" v={`${typography.length} families`} />
              <Spec k="screenshots" v={screenshots.length} />
            </tbody>
          </table>
        </aside>
      </div>

      {lightboxIndex !== null && screenshots[lightboxIndex] && (
        <Lightbox
          src={screenshots[lightboxIndex]}
          onClose={() => setLightboxIndex(null)}
          onPrev={
            lightboxIndex > 0 ? () => setLightboxIndex(lightboxIndex - 1) : undefined
          }
          onNext={
            lightboxIndex < screenshots.length - 1
              ? () => setLightboxIndex(lightboxIndex + 1)
              : undefined
          }
        />
      )}
    </div>
  );
}

function asHex(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v) && v.length) return asHex(v[0]);
  if (v && typeof v === "object") {
    const o = v as any;
    if (typeof o.value === "string") return o.value;
    if (typeof o.hex === "string") return o.hex;
    if (typeof o.color === "string") return o.color;
  }
  return null;
}

function extractPalette(brand: any): { hex: string; label: string }[] {
  const out: { hex: string; label: string }[] = [];
  const seen = new Set<string>();
  const push = (hex: string | null, label: string) => {
    if (!hex) return;
    const k = hex.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ hex, label });
  };

  const tokens = brand?.tokens?.colors;
  if (tokens && typeof tokens === "object") {
    for (const [k, v] of Object.entries(tokens)) {
      if (Array.isArray(v)) {
        v.forEach((entry, i) => push(asHex(entry), `${k}/${i + 1}`));
      } else {
        push(asHex(v), k);
      }
    }
  }

  const direct = brand?.colors;
  if (direct && typeof direct === "object") {
    for (const [k, v] of Object.entries(direct)) {
      if (Array.isArray(v)) {
        v.forEach((entry, i) => push(asHex(entry), `${k}/${i + 1}`));
      } else {
        push(asHex(v), k);
      }
    }
  }

  if (Array.isArray(brand?.palette)) {
    brand.palette.forEach((c: any, i: number) => push(asHex(c), `c${i + 1}`));
  }

  return out;
}

function normalizeTypography(brand: any): any[] {
  const tokens = brand?.tokens?.typography;
  if (Array.isArray(tokens)) return tokens;
  const direct = brand?.typography;
  if (Array.isArray(direct)) return direct;
  if (direct && typeof direct === "object") {
    const out: any[] = [];
    if (direct.headingFamily) {
      out.push({
        family: direct.headingFamily,
        weights: direct.headingWeights || [],
        usage: "heading",
      });
    }
    if (direct.bodyFamily && direct.bodyFamily !== direct.headingFamily) {
      out.push({
        family: direct.bodyFamily,
        weights: direct.bodyWeights || [],
        usage: "body",
      });
    }
    return out;
  }
  return [];
}
