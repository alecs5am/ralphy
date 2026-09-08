import { GradientAvatar } from "@outpacelabs/avatars";
import { INSTRUMENT_PALETTE } from "../instrument/palette";
import { projectGlyphSlot } from "../lib/project-glyph";

// Temporary local fallback until the signed-in Ralphy Cloud account supplies identity.
export function profileIdentity(rootPath: string): string {
  const userMatch = rootPath.match(/\/Users\/([^/]+)/);
  return userMatch?.[1] ?? rootPath.split("/").filter(Boolean).at(-2) ?? "Ralphy";
}

export function ProfileAvatar({
  rootPath,
  size = 26,
  round = false,
}: {
  rootPath: string;
  size?: number;
  round?: boolean;
}) {
  const identity = profileIdentity(rootPath);
  const palette = INSTRUMENT_PALETTE.dark;
  const highlight = palette[`identity${projectGlyphSlot(identity)}Highlight` as keyof typeof palette];
  return (
    <span className={`profile-avatar inline-grid flex-none place-items-center overflow-hidden rounded-control bg-instrument-raised${round ? " profile-avatar-round [corner-shape:round]" : ""}`} aria-hidden="true" style={{ width: size, height: size }}>
      <GradientAvatar
        // Twice the display size gives the dither the workspace's finer grain.
        size={size * 2}
        style={{ width: size, height: size }}
        seed={identity}
        pattern="dither"
        colors={[palette.widgetDark, highlight]}
        radius={round ? "50%" : 0}
      />
    </span>
  );
}
