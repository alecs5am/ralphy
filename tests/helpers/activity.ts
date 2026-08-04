// Test helper: activity is one store-wide sequence, so scoped views are a
// local client-side filter over the drained feed, never a store query.

import { listGlobalActivity } from "../../cli/lib/store/activity.js";
import type { ActivityDto } from "../../cli/lib/store/types.js";

export function scopedActivity(
  filter: { workspaceId?: string; projectId?: string } = {},
): ActivityDto[] {
  const items: ActivityDto[] = [];
  let afterSequence = 0;
  for (;;) {
    const page = listGlobalActivity({ afterSequence, limit: 100 });
    items.push(...page.items);
    if (page.nextCursor === null) break;
    afterSequence = page.nextCursor;
  }
  return items.filter(
    (event) =>
      (filter.workspaceId === undefined ||
        event.workspaceId === filter.workspaceId) &&
      (filter.projectId === undefined || event.projectId === filter.projectId),
  );
}
