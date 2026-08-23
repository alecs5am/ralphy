import Avatar from "boring-avatars";
import { INSTRUMENT_PALETTE } from "../instrument/palette";

// boring-avatars picks a deterministic slice of this ramp per identity, so the avatar is
// the same identity colour system as workspace grain rather than a grey blob.
const avatarColors = [
  INSTRUMENT_PALETTE.dark.identity1,
  INSTRUMENT_PALETTE.dark.identity3,
  INSTRUMENT_PALETTE.dark.identity5,
  INSTRUMENT_PALETTE.dark.identity7,
  INSTRUMENT_PALETTE.dark.identity4Highlight,
];

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
  return (
    <span className={`profile-avatar inline-grid flex-none place-items-center overflow-hidden rounded-control bg-instrument-raised${round ? " profile-avatar-round [corner-shape:round]" : ""}`} aria-hidden="true" style={{ width: size, height: size }}>
      <Avatar
        size={size}
        name={identity}
        variant="beam"
        colors={avatarColors}
        square={!round}
      />
    </span>
  );
}
