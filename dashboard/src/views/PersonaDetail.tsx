import { useWorkspace } from "../stores/workspace";
import { ERA, MONO, SANS, DISPLAY, paletteFor } from "../era/tokens";
import {
  Btn,
  Crosses,
  PlaceholderImg,
  SectionHead,
  Spec,
} from "../era/components";
import { PlayIcon, WandIcon } from "../era/icons";

export function PersonaDetail({ personaId }: { personaId: string }) {
  const personas = useWorkspace((s) => s.personas);
  const persona = personas.find((p) => p.id === personaId) as any;

  if (!persona) {
    return (
      <div
        className="h-full flex items-center justify-center text-[12px]"
        style={{ color: ERA.mute }}
      >
        persona not found
      </div>
    );
  }

  const idx = personas.findIndex((p) => p.id === personaId);
  const pal = paletteFor(persona.id, idx);

  const v = persona.voice;
  const voiceObj = typeof v === "string" ? null : v;
  const demo = persona.demographics || {};
  const style = persona.speakingStyle || {};
  const fillers: string[] = Array.isArray(style.filler) ? style.filler : [];

  const avatarUrl = persona.avatar
    ? typeof persona.avatar === "string" && persona.avatar.startsWith("http")
      ? persona.avatar
      : `/media/${String(persona.avatar).replace(/^\/+/, "")}`
    : persona.referenceImage
    ? `/media/${String(persona.referenceImage).replace(/^\/+/, "")}`
    : null;

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: ERA.bg, color: ERA.ink, ...SANS }}
    >
      <header
        className="relative px-8 pt-8 pb-6 grid grid-cols-12 gap-6 items-end"
        style={{ borderBottom: `1px solid ${ERA.rule}` }}
      >
        <Crosses size={10} />
        <div className="col-span-8">
          <div
            className="flex items-baseline gap-3 text-[10px] uppercase tracking-[0.22em] mb-3"
            style={{ color: ERA.mute, ...MONO }}
          >
            <span>persona</span>
            <span>—</span>
            <span>{persona.id}</span>
            {persona.tag && (
              <>
                <span>—</span>
                <span>{persona.tag}</span>
              </>
            )}
          </div>
          <h1 className="text-[72px] leading-[0.92]" style={{ ...DISPLAY }}>
            {persona.fullName || persona.name}
          </h1>
          <div className="text-[15px] mt-3" style={{ color: ERA.sub }}>
            {[demo.archetype, demo.ageRange, persona.tone]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="col-span-4">
          <PlaceholderImg
            palette={pal}
            ratio="1/1"
            className="w-full"
            label={persona.name}
            src={avatarUrl}
          />
        </div>
      </header>

      <div className="p-8 grid grid-cols-12 gap-8">
        <div className="col-span-8">
          <SectionHead section="01" title="speaking style" />
          <table className="w-full" style={{ ...MONO, fontSize: 11 }}>
            <tbody>
              <Spec k="pacing" v={style.pacing || "—"} />
              <Spec k="emphasis" v={style.emphasis || "—"} />
              <Spec k="cta" v={style.cta || "—"} />
              <Spec
                k="filler"
                v={fillers.length ? fillers.map((f) => `"${f}"`).join(", ") : "—"}
              />
              <Spec k="tone" v={persona.tone || "—"} />
              <Spec k="language" v={persona.language || "—"} />
            </tbody>
          </table>
        </div>

        <aside className="col-span-4">
          <SectionHead section="voice" title="config" />
          <table className="w-full" style={{ ...MONO, fontSize: 11 }}>
            <tbody>
              {voiceObj ? (
                <>
                  <Spec k="provider" v={voiceObj.provider || "—"} />
                  <Spec k="model" v={voiceObj.model || "—"} />
                  <Spec k="voice id" v={voiceObj.voiceId || "—"} />
                  {voiceObj.stability != null && (
                    <Spec k="stability" v={voiceObj.stability} />
                  )}
                  {voiceObj.similarityBoost != null && (
                    <Spec k="similarity" v={voiceObj.similarityBoost} />
                  )}
                  {voiceObj.style != null && <Spec k="style" v={voiceObj.style} />}
                </>
              ) : (
                <Spec k="voice" v={String(v ?? "—")} />
              )}
            </tbody>
          </table>

          {voiceObj && (
            <div className="mt-6 space-y-3">
              {(
                [
                  ["stability", voiceObj.stability],
                  ["similarity", voiceObj.similarityBoost],
                  ["style", voiceObj.style],
                ] as const
              )
                .filter(([, val]) => typeof val === "number")
                .map(([k, val]) => (
                  <div key={k}>
                    <div
                      className="flex justify-between text-[10px] mb-1"
                      style={{ ...MONO, color: ERA.mute }}
                    >
                      <span>{k}</span>
                      <span>{(val as number).toFixed(2)}</span>
                    </div>
                    <div
                      className="h-1 relative"
                      style={{ background: ERA.rule }}
                    >
                      <span
                        className="absolute left-0 top-0 bottom-0"
                        style={{
                          width: `${(val as number) * 100}%`,
                          background: ERA.ink,
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          )}

          {(demo.ageRange || demo.gender || demo.archetype) && (
            <div className="mt-6">
              <SectionHead section="demo" title="demographics" />
              <table className="w-full" style={{ ...MONO, fontSize: 11 }}>
                <tbody>
                  {demo.ageRange && <Spec k="age" v={demo.ageRange} />}
                  {demo.gender && <Spec k="gender" v={demo.gender} />}
                  {demo.archetype && <Spec k="archetype" v={demo.archetype} />}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <Btn kind="primary" icon={<PlayIcon size={10} />}>
              play sample
            </Btn>
            <Btn icon={<WandIcon size={11} />}>regenerate voice</Btn>
          </div>
        </aside>
      </div>
    </div>
  );
}
