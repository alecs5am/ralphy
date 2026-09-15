import { Facebook, Globe, Instagram, Linkedin, Pinterest, Tiktok, Twitter, Youtube, type AppIcon } from "./icons";

type SocialIconProps = { platform: string; className?: string };
const PLATFORMS: Record<string, AppIcon> = {
  facebook: Facebook, instagram: Instagram, linkedin: Linkedin, pinterest: Pinterest,
  tiktok: Tiktok, x: Twitter, youtube: Youtube,
};

export function SocialIcon({ platform, className }: SocialIconProps) {
  const Icon = Object.hasOwn(PLATFORMS, platform) ? PLATFORMS[platform] : Globe;
  return <Icon className={className} aria-hidden="true" />;
}
