import type * as React from "react";
import type { LucideIcon } from "lucide-react";

export type Availability<T> =
  | { status: "ready"; value: T }
  | { status: "partial"; value: T; reason: string }
  | { status: "empty"; reason: string }
  | { status: "unavailable"; reason: string }
  | { status: "error"; reason: string };

export type ThemePreference = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";
export type InstrumentRightRailMode = "docked" | "overlay" | "closed";
export type InstrumentRightRailOwner = "chat" | "shared-inspector";

export interface InstrumentProfileIdentity {
  displayName: string;
  initials: string;
  avatarUrl: string | null;
}

export interface InstrumentScreenHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  filters?: React.ReactNode;
  counters?: React.ReactNode;
  actions?: React.ReactNode;
}

export interface ProjectDockItem<Id extends string = string> {
  id: Id;
  label: string;
  icon: LucideIcon;
  disabledReason?: string;
}
