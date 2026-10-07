"use client";

import { createRef, useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { ReactionBarItem, StoryViewerStory } from "@/components/ui";
import { StoryViewer } from "@/components/ui/story-viewer";
import { Sheet } from "@/components/ui/sheet";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/components/sessions/numerals";
import { FrameBody, frameAge, frameDurationMs } from "@/components/stories/frames";
import { CaptureFlow } from "@/components/stories/capture-flow";
import { recordStoryViewsAction, removeMeFromFrameAction, reportStoryFrameAction, setStoryReactionAction } from "@/components/stories/actions";
import type { PreparedStories } from "@/components/stories/prepared";
import type { StoryReactionKind } from "@/lib/dal/reactions";
import type { StoryFrame } from "@/lib/dal/stories";

// The viewer's host — what `ui/story-viewer` needs from the app, and nothing it may not have (REQ-STO-005, 007, 010,
// 011, 014, 015). One host serves the ring row on `010` and «شاهد القصة» on `012` (DEC-251 §4.7). It holds which
// story is open, writes views in BATCHES (Server Actions run one at a time per client — never `Promise.all`),
// keeps the member's one reaction per frame, and opens the capture and the report sheet.

const REACTIONS: readonly StoryReactionKind[] = ["heart", "fire", "clap", "idea"];
const GLYPH: Record<StoryReactionKind, string> = { heart: "❤️", fire: "🔥", clap: "👏", idea: "💡" };

const VIEWS_FLUSH_MS = 4000;

type ReactionEntry = PreparedStories["reactions"][string];

/** The entry with the member's reaction moved to `mine` — the old one's count down, the new one's up. */
function withMine(entry: ReactionEntry, mine: StoryReactionKind | null): ReactionEntry {
  const totals = { ...entry.totals };
  if (entry.mine) totals[entry.mine] = Math.max(0, totals[entry.mine] - 1);
  if (mine) totals[mine] += 1;
  return { totals, mine };
}

/** The pictures a frame draws — what is worth fetching before it is shown. */
function frameImages(frame: StoryFrame, media: PreparedStories["media"]): string[] {
  if (frame.kind === "published") return frame.posterUrl ? [frame.posterUrl] : [];
  if (frame.kind === "photo") return media.photos[frame.photoId] ? [media.photos[frame.photoId]] : [];
  if (frame.kind === "recap") return frame.photoIds.map((id) => media.photos[id]).filter(Boolean);
  if (frame.kind === "video") return media.videos[frame.id]?.posterUrl ? [media.videos[frame.id].posterUrl] : [];
  return [];
}

function initial(name: string | null | undefined): string {
  return (name ?? "").trim().charAt(0) || "·";
}

export function useStoryHost(prepared: PreparedStories) {
  const t = useTranslations("stories");
  const locale = useLocale();
  const router = useRouter();
  const { sessions, media, canAdd, viewerId, now } = prepared;

  const [openAt, setOpenAt] = useState<number | null>(null);
  const [lastIndex, setLastIndex] = useState(0);
  const opener = useRef<HTMLElement | null>(null);
  const [reactions, setReactions] = useState(prepared.reactions);
  // The newest tap per frame: an older answer arriving after a newer tap is ignored (DEC-278).
  const reactionSeq = useRef(new Map<string, number>());
  const [seen, setSeen] = useState(() => new Set(sessions.flatMap((s) => s.frames.filter((f) => f.seen).map((f) => f.id))));
  const [capture, setCapture] = useState<string | null>(null);
  const [report, setReport] = useState<{ frameId: string; error: string | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ── views: a queue, flushed one action at a time ─────────────────────────
  const queue = useRef<string[]>([]);
  const inFlight = useRef(false);
  const flush = useCallback(async () => {
    // A loop, never a recursion: whatever arrived while a batch was in flight goes in the next one.
    if (inFlight.current) return;
    inFlight.current = true;
    while (queue.current.length > 0) {
      const batch = queue.current.splice(0, queue.current.length);
      await recordStoryViewsAction(locale, batch);
    }
    inFlight.current = false;
  }, [locale]);
  // ★ BATCHED ON A TIMER, NOT PER FRAME (DEC-278). Server Actions run one at a time per client, so a view written the
  // moment each frame appeared stood in front of every reaction tapped on it — the «I tapped and nothing happened» the
  // owner saw. Views wait a few seconds and leave together, and always on close.
  const flushTimer = useRef<number | null>(null);
  // ★ The next frame's picture is fetched while this one shows (DEC-278), so a tap forward never waits on the network.
  const preloaded = useRef(new Set<string>());
  const preload = useCallback(
    (frame: StoryFrame | undefined) => {
      if (!frame) return;
      for (const url of frameImages(frame, media)) {
        if (preloaded.current.has(url)) continue;
        preloaded.current.add(url);
        const img = new Image();
        img.decoding = "async";
        img.src = url;
      }
    },
    [media],
  );
  const onFrameShown = useCallback(
    (storyId: string, frameId: string) => {
      const si = sessions.findIndex((x) => x.sessionId === storyId);
      const fi = si < 0 ? -1 : sessions[si].frames.findIndex((x) => x.id === frameId);
      if (fi >= 0) preload(sessions[si].frames[fi + 1] ?? sessions[si + 1]?.frames[sessions[si + 1].firstUnseenIndex]);
      setSeen((prev) => (prev.has(frameId) ? prev : new Set(prev).add(frameId)));
      queue.current.push(frameId);
      if (flushTimer.current === null)
        flushTimer.current = window.setTimeout(() => {
          flushTimer.current = null;
          void flush();
        }, VIEWS_FLUSH_MS);
    },
    [flush, preload, sessions],
  );

  // One ref per video frame: the viewer's clock reads the element (REQ-STO-007's «a video its length»).
  const videoRefs = useMemo(() => {
    const refs = new Map<string, RefObject<HTMLVideoElement | null>>();
    for (const s of sessions) for (const f of s.frames) if (f.kind === "video") refs.set(f.id, createRef<HTMLVideoElement>());
    return refs;
  }, [sessions]);

  // ★ OPTIMISTIC (DEC-278): the tap shows at once — the press and the count — and the server follows. A reaction is the
  // member's own and uncontended (one per member per frame, REQ-STO-010), so drawing it before the answer misstates
  // nothing; a refusal puts the frame back as it was. Only the newest tap's answer is applied.
  const react = useCallback(
    async (frameId: string, kind: string) => {
      const before = reactions[frameId] ?? { totals: { heart: 0, fire: 0, clap: 0, idea: 0 }, mine: null };
      const next = before.mine === kind ? null : (kind as StoryReactionKind);
      const seq = (reactionSeq.current.get(frameId) ?? 0) + 1;
      reactionSeq.current.set(frameId, seq);
      setReactions((prev) => ({ ...prev, [frameId]: withMine(prev[frameId] ?? before, next) }));
      const result = await setStoryReactionAction(locale, frameId, next);
      if (reactionSeq.current.get(frameId) !== seq) return;
      setReactions((prev) => {
        const entry = prev[frameId] ?? before;
        if ("error" in result) return { ...prev, [frameId]: before };
        return result.mine === entry.mine ? prev : { ...prev, [frameId]: withMine(entry, result.mine) };
      });
    },
    [locale, reactions],
  );

  const ownerOf = (frame: StoryFrame): string | null =>
    frame.kind === "photo" ? (frame.uploader?.memberId ?? null) : frame.kind === "video" ? (frame.author?.memberId ?? null) : null;

  const stories: StoryViewerStory[] = sessions.map((s) => {
    const presenter = s.presenter;
    const meta = [presenter?.name, presenter?.company].filter(Boolean).join(" · ");
    return {
      id: s.sessionId,
      title: s.title,
      meta,
      glyph: initial(presenter?.company ?? s.title),
      teamColor: s.teamColor,
      startIndex: s.firstUnseenIndex,
      onAdd: canAdd[s.sessionId]
        ? () => {
            setOpenAt(null);
            setCapture(s.sessionId);
          }
        : undefined,
      frames: s.frames.map((f) => {
        const attendee = f.kind === "photo" || f.kind === "video";
        const own = attendee && ownerOf(f) === viewerId;
        const visible = f.kind !== "video" || f.state === "visible";
        const entry = reactions[f.id];
        const items: ReactionBarItem[] = REACTIONS.map((k) => ({
          kind: k,
          label: t(`reaction.${k}`),
          count: entry?.totals[k] ?? 0,
          pressed: entry?.mine === k,
          icon: <span aria-hidden>{GLYPH[k]}</span>,
        }));
        return {
          id: f.id,
          content: <FrameBody frame={f} session={s} media={media} now={now} locale={locale} videoRef={videoRefs.get(f.id)} />,
          durationMs: frameDurationMs(f, media),
          age: frameAge(t, f.triggeredAt, now),
          media: f.kind === "video" && visible ? videoRefs.get(f.id) : undefined,
          action: visible
            ? { label: f.action.kind === "download_materials" ? t("action.downloadMaterials") : t("action.openSession"), href: f.action.href }
            : undefined,
          reactions: visible ? { label: t("viewer.reactions"), items, onToggle: (k: string) => void react(f.id, k) } : undefined,
          moderation:
            attendee && visible
              ? {
                  menuLabel: t("viewer.more"),
                  items: [
                    {
                      label: t("moderation.removeMe"),
                      onSelect: () =>
                        void removeMeFromFrameAction(locale, {
                          id: f.id,
                          kind: f.kind,
                          photoId: f.kind === "photo" ? f.photoId : undefined,
                          sessionId: s.sessionId,
                        }).then((r) => {
                          if ("done" in r) {
                            setNotice(t("moderation.reported"));
                            router.refresh();
                          }
                        }),
                    },
                    ...(own ? [] : [{ label: t("moderation.report"), onSelect: () => setReport({ frameId: f.id, error: null }) }]),
                  ],
                }
              : undefined,
        };
      }),
    };
  });

  const open = useCallback((index: number, from: HTMLElement | null) => {
    opener.current = from;
    const s = sessions[index];
    preload(s?.frames[s.firstUnseenIndex]);
    setLastIndex(index);
    setOpenAt(index);
  }, [preload, sessions]);

  const close = useCallback(() => {
    setOpenAt(null);
    if (flushTimer.current !== null) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    void flush();
    router.refresh();
  }, [flush, router]);

  const labels = {
    dialog: t("viewer.dialog", { title: sessions[openAt ?? lastIndex]?.title ?? "" }),
    previous: t("viewer.previous"),
    next: t("viewer.next"),
    pause: t("viewer.pause"),
    resume: t("viewer.resume"),
    close: t("viewer.close"),
    add: t("viewer.add"),
    paused: t("viewer.paused"),
    position: (current: number, total: number) => t("viewer.position", { current: formatNumber(current), total: formatNumber(total) }),
  };

  async function submitReport(form: FormData) {
    if (!report) return;
    const result = await reportStoryFrameAction(locale, report.frameId, String(form.get("reason") ?? ""));
    if ("outcome" in result && (result.outcome === "reported" || result.outcome === "already_reported")) {
      setReport(null);
      setNotice(t("moderation.reported"));
      router.refresh();
    } else setReport({ frameId: report.frameId, error: "outcome" in result ? result.outcome : result.error });
  }

  const elements = (
    <>
      <StoryViewer
        open={openAt !== null}
        stories={stories}
        storyIndex={openAt ?? lastIndex}
        onClose={close}
        onFrameShown={onFrameShown}
        returnFocusTo={opener}
        paused={report !== null}
        labels={labels}
      />
      <Sheet open={report !== null} onOpenChange={(o) => (o ? null : setReport(null))} title={t("moderation.report")}>
        <form action={submitReport} noValidate className="flex flex-col gap-4">
          <Field id="story-report-reason" label={t("moderation.reportReason")} required error={report?.error ? t("moderation.reportReason") : undefined}>
            <Textarea name="reason" rows={3} minLength={3} maxLength={1000} />
          </Field>
          <Button type="submit">{t("moderation.report")}</Button>
        </form>
      </Sheet>
      {capture ? (
        <CaptureFlow
          sessionId={capture}
          onClose={() => {
            setCapture(null);
            // A posted frame shows as «processing» in the story: read the rings again.
            router.refresh();
          }}
        />
      ) : null}
      {/* Said once, when there is something to say — never an empty status region at rest on the home. */}
      {notice ? (
        <p role="status" className="sr-only">
          {notice}
        </p>
      ) : null}
    </>
  );

  /** Opens the capture for a session — «أضف قصتك» on the ring row (DEC-278). */
  const startCapture = useCallback((sessionId: string) => {
    setOpenAt(null);
    setCapture(sessionId);
  }, []);

  return { open, startCapture, elements, seen, frameAge: (at: string) => frameAge(t, at, now) };
}
