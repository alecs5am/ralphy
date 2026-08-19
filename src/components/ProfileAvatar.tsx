import Avatar from "boring-avatars";

const avatarColors = ["#c4b5fd", "#8b5cf6", "#5b5b62", "#d8d8dc", "#2d2d2d"];

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
