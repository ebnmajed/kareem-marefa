"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import type { StoryRingState } from "@/components/ui";
import { StoryRing } from "@/components/ui/story-ring";
import { useStoryHost } from "@/components/stories/story-host";
import type { PreparedStories } from "@/components/stories/prepared";
import type { StorySession } from "@/lib/dal/stories";

// The ring's shape from the feed's state (DEC-251 §4.5): there is no fifth `story-ring` state — `unseen` is drawn
// with the `upcoming` shape before completion and the `recap` shape after; the word under it is the caller's.
export function ringShape(session: Pick<StorySession, "ring" | "phase">, seenNow: boolean): StoryRingState {
  if (session.ring === "live") return "live";
  if (session.ring === "seen" || seenNow) return "seen";
  return session.phase === "completed" ? "recap" : "upcoming";
}

export function StoryRingsClient({ prepared }: { prepared: PreparedStories }) {
  const t = useTranslations("feed");
  const ts = useTranslations("stories");
  const host = useStoryHost(prepared);
  // Focus returns to the ring that opened the viewer — found from its item, since Safari does not focus a clicked button.
  const items = useRef(new Map<string, HTMLLIElement>());
  return (
    <>
      <ul aria-label={t("rings.label")} className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {prepared.sessions.map((s, i) => {
          // Every visible frame viewed in this visit turns the ring seen at once; the refresh on close confirms it.
          const seenNow = s.ring !== "live" && s.frames.every((f) => host.seen.has(f.id));
          const state = ringShape(s, seenNow);
          const word = state === "seen" ? ts("ring.seen") : t(`rings.state.${state}`);
          const newest = s.frames[s.frames.length - 1];
          const caption = state === "live" ? t("rings.now") : newest ? host.frameAge(newest.triggeredAt) : "";
          return (
            <li
              key={s.sessionId}
              className="shrink-0"
              ref={(el) => {
                if (el) items.current.set(s.sessionId, el);
                else items.current.delete(s.sessionId);
              }}
            >
              <StoryRing
                state={state}
                label={t("rings.name", { title: s.title, state: word, caption })}
                stateLabel={word}
                glyph={(s.presenter?.company ?? s.title).trim().charAt(0)}
                caption={caption}
                teamColor={s.teamColor}
                onOpen={() => host.open(i, items.current.get(s.sessionId)?.querySelector("button") ?? null)}
              />
            </li>
          );
        })}
      </ul>
      {host.elements}
    </>
  );
}
