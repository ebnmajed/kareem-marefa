"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { StoryRingState } from "@/components/ui";
import { StoryRing } from "@/components/ui/story-ring";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { PlusIcon } from "@/components/ui/icons";
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

export function StoryRingsClient({ prepared, capture = [] }: { prepared: PreparedStories; capture?: { sessionId: string; title: string }[] }) {
  const t = useTranslations("feed");
  const ts = useTranslations("stories");
  const host = useStoryHost(prepared);
  const [choosing, setChoosing] = useState(false);
  // «أضف قصتك» (DEC-278): one session opens its capture at once; several ask which, in a sheet.
  const add = () => (capture.length === 1 ? host.startCapture(capture[0].sessionId) : setChoosing(true));
  // Focus returns to the ring that opened the viewer — found from its item, since Safari does not focus a clicked button.
  const items = useRef(new Map<string, HTMLLIElement>());
  return (
    <>
      <ul aria-label={t("rings.label")} className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {capture.length > 0 ? (
          // The first ring, as Instagram's «قصتك»: a dashed circle and a plus, the ring's own box and type — never a
          // fifth `story-ring` state, because it opens the capture, not a story.
          <li className="shrink-0">
            <button
              type="button"
              aria-label={ts("ring.addLabel")}
              aria-haspopup="dialog"
              onClick={add}
              className="inline-flex min-h-11 w-[4.25rem] shrink-0 flex-col items-center gap-1 rounded-tile p-0.5"
            >
              <span aria-hidden className="inline-flex size-15 items-center justify-center rounded-pill border-2 border-dashed border-edge-strong bg-surface text-2xl text-fg-heading">
                <PlusIcon />
              </span>
              <span aria-hidden className="text-caption font-bold leading-tight text-fg-heading">
                {ts("ring.add")}
              </span>
            </button>
          </li>
        ) : null}
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
      <Sheet open={choosing} onOpenChange={setChoosing} title={ts("ring.choose")}>
        <ul className="flex flex-col gap-2">
          {capture.map((c) => (
            <li key={c.sessionId}>
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="w-full justify-start text-start"
                onClick={() => {
                  setChoosing(false);
                  host.startCapture(c.sessionId);
                }}
              >
                <bdi>{c.title}</bdi>
              </Button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
