import Avatar from "boring-avatars";
import { INSTRUMENT_PALETTE } from "../instrument/palette";

const avatarColors = [
  INSTRUMENT_PALETTE.dark.ditherHighlight,
  INSTRUMENT_PALETTE.dark.textSecondaryReadable,
  INSTRUMENT_PALETTE.dark.textOnDarkMutedDecorative,
  INSTRUMENT_PALETTE.dark.textOnDarkPrimary,
  INSTRUMENT_PALETTE.dark.legacyRaised,
];

// Temporary local fallback until the signed-in Ralphy Cloud account supplies identity.
export function profileIdentity(rootPath: string): string {
  const userMatch = rootPath.match(/\/Users\/([^/]+)/);
  return userMatch?.[1] ?? rootPath.split("/").filter(Boolean).at(-2) ?? "Ralphy";
}

export function ProfileAvatar({
  rootPath,
  size = 26,
}: {
  rootPath: string;
  size?: number;
}) {
  const identity = profileIdentity(rootPath);
  return (
    <span className="profile-avatar" aria-hidden="true" style={{ width: size, height: size }}>
      <Avatar
        size={size}
        name={identity}
        variant="beam"
        colors={avatarColors}
        square
      />
    </span>
  );
}
