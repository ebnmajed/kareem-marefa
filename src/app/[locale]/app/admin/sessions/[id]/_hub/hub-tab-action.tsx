"use client";

import type { ReactNode } from "react";
import { useSearchParams, useSelectedLayoutSegment } from "next/navigation";

// Contract 4's switch — REQ-UIX-089, DEC-228. The layout renders every tab's own primary on the server and hands them
// here as a map; this shows the current tab's, from the URL. A layout is not re-rendered between its pages, but the
// segment is read on the client, so the right action follows every soft navigation (the strip's own reading,
// `session-settings-strip.tsx`). A parallel `@actions` slot was rejected: an unmatched slot keeps its last subpage on
// a soft navigation, so «شاشة التقديم» would linger on الجدولة.
//
// ★ While الجدولة is in edit mode (`?edit`) the lifecycle action is hidden: «انشر» here publishes the STORED schedule,
// and the form beneath has its own «انشر الجلسة», which saves what was typed first.

export type HubTab = "schedule" | "attendance" | "survey" | "certificates";

export function HubTabAction({ actions, page, lifecycle }: { actions: Partial<Record<HubTab, ReactNode>>; page: ReactNode; lifecycle: ReactNode }) {
  const segment = useSelectedLayoutSegment() as HubTab | null;
  const params = useSearchParams();
  const editing = segment === "schedule" && params.has("edit");
  return (
    <>
      {segment ? actions[segment] : null}
      {page}
      {editing ? null : lifecycle}
    </>
  );
}
