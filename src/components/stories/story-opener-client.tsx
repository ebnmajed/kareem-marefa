"use client";

import type { ReactNode } from "react";
import { useStoryHost } from "@/components/stories/story-host";
import type { PreparedStories } from "@/components/stories/prepared";

// The button behind «شاهد القصة». Its accessible name is its content (`sessions'` pill); it says it opens a dialog.
export function StoryOpenerClient({ prepared, index, className = "", children }: { prepared: PreparedStories; index: number; className?: string; children: ReactNode }) {
  const host = useStoryHost(prepared);
  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={(e) => host.open(index, e.currentTarget)} className={className}>
        {children}
      </button>
      {host.elements}
    </>
  );
}
