import type { AppIcon } from "@/shared/ui/icons";
import type { ReactNode } from "react";
import { WindowTitlebar } from "@/shared/ui/Window";
import { SECTION_META, SECTION_TITLE } from "../lib/overview-chrome";

export function OverviewHeading({ id, title, icon: Icon, meta, children }: {
  id: string;
  title: string;
  icon: AppIcon;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return <WindowTitlebar className="workspace-section-heading">
    <Icon className="size-4 shrink-0 text-muted" aria-hidden="true" />
    <h2 className={`${SECTION_TITLE} min-w-0 flex-1 truncate`} id={id}>{title}</h2>
    {meta && <span className={`${SECTION_META} shrink-0`}>{meta}</span>}
    {children}
  </WindowTitlebar>;
}
