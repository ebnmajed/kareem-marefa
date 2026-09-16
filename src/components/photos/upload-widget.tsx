"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { AlertCircleIcon } from "@/components/ui/icons";
import { subscribeToSessionTopic } from "@/lib/realtime/channel";
import type { PhotoKind } from "@/lib/dal/photos";

// REQ-EVT-009/010/011/013 — the same shape as src/components/materials/
// upload-form.tsx (plain fetch PUT to a signed URL, bytes never traverse
// this app's server, no browser Supabase client — see that file's header
// for the DEC-020 reasoning, identical here).
//
// ★ REQ-EVT-010, as amended by `DEC-139`: a photo publishes with no human
// step, the moment its strip completes — `process_photo` (the worker)
// still has to download, sniff, strip and insert the row, so the 202
// accepted here is not the photo appearing yet — but the uploader's OWN
// gallery must take its place without a reload once that finishes,
// which the plain `router.refresh()` immediately after the 202 could
// never do (nothing has been inserted yet). `photos_broadcast()`
// (`supabase/proposed/content/`) reuses the exact `session:<id>` topic
// and RLS `comments_broadcast()` already established (03 §7.3/§7.4) — no
// new topic, no new policy — and fires an AFTER INSERT trigger on
// `photos`, because a photo row is only ever inserted already stripped
// (`photos`' own `check (exif_stripped)` constraint, 0037): there is no
// separate "now visible" transition to track, the INSERT *is* the moment.
//
// The widget subscribes only while ITS OWN upload is between "accepted"
// and "visible" — not an always-on listener for the whole time the photos
// section is on screen, which every other viewer's browser would also be
// running for no benefit most of the time. A bounded fallback timer
// covers a missed or delayed broadcast: a single re-check of server state
// after a ceiling, which is the "data poll for server state" `DEC-136`
// explicitly distinguishes from the pending-control "nudge" it forbids —
// this never retries on a timer while idle, only once, and only because
// this member is still waiting on their own upload.
//
// ★ REQ-UIX-024, wave 6: `ui/file-drop` states JPEG/PNG/WebP and the org's
// own size limit BEFORE a file is chosen.

/** How long to wait for the broadcast before refreshing anyway. Generous:
 *  the worker downloads, sniffs, strips EXIF and re-uploads a real file —
 *  seconds, not milliseconds, and a member who waited this long already
 *  has "تتم معالجة الصورة الآن…" on screen telling them why. */
const PROCESSING_TIMEOUT_MS = 20_000;

function sniffKindFromFile(file: File): PhotoKind | null {
  const type = file.type.toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg") return "jpeg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  if (ext === "png") return "png";
  if (ext === "webp") return "webp";
  return null;
}

interface UploadWidgetProps {
  locale: string;
  sessionId: string;
  imageLimitMb: number;
}

export function UploadWidget({ locale, sessionId, imageLimitMb }: UploadWidgetProps) {
  const t = useTranslations("photos.upload");
  const router = useRouter();
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [resetKey, setResetKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ReactNode>(null);
  // The photo id this widget is waiting to see published, or null when it
  // is not waiting on anything, and the fallback timer for it — both
  // refs, not state: read from inside an event callback and a timeout,
  // never rendered themselves.
  const awaitingPhotoId = useRef<string | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // `useCallback` gives this a stable identity across renders — otherwise
  // it would count as a new dependency every render and the subscription
  // effect below would tear down and reopen the socket on every one.
  const resolveAwaited = useCallback(() => {
    awaitingPhotoId.current = null;
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    fallbackTimer.current = undefined;
    router.refresh();
  }, [router]);

  // The subscription is mounted for the widget's own lifetime — cheap
  // while idle, since every message is ignored until `awaitingPhotoId` is
  // actually set — rather than opened and closed once per upload, which
  // would race a broadcast that arrives in the gap between two sockets.
  useEffect(() => {
    if (!sessionId) return;
    const unsubscribe = subscribeToSessionTopic(sessionId, (message) => {
      if (message.event !== "INSERT") return;
      if (!awaitingPhotoId.current || message.payload.id !== awaitingPhotoId.current) return;
      resolveAwaited();
    });
    return () => {
      unsubscribe();
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    };
  }, [sessionId, resolveAwaited]);

  function handleSubmit() {
    setError(null);
    const file = files[0] ?? null;
    if (!file) {
      setError(t("fileRequired"));
      return;
    }
    const kind = sniffKindFromFile(file);
    if (!kind) {
      setError(t("unsupportedType"));
      return;
    }

    // ★ `pending` (the uploader's busy state) covers only the upload
    // round trip, not the wait for the broadcast — `router.refresh()` now
    // happens later, outside this transition entirely (see
    // `resolveAwaited`), once the photo is actually visible rather than
    // once the 202 lands.
    //
    // ★ The lead's real-build finding on the event page's discussion (the
    // identical shape here): a request that fails at the NETWORK level
    // (offline, a dropped connection) makes `fetch` REJECT rather than
    // resolve to a response — left uncaught, that throw would propagate out
    // of this `startTransition` callback and React would replace the whole
    // page with the route's error boundary. Caught below; the selected file
    // is untouched on that path, and `router.refresh()` is never reached.
    startTransition(async () => {
      try {
        const initiateRes = await fetch("/api/upload/photo", {
          method: "POST",
          headers: { "content-type": "application/json", "x-locale": locale },
          body: JSON.stringify({ sessionId, kind, declaredByteSize: file.size }),
        });
        const initiateBody = await initiateRes.json();
        if (!initiateRes.ok) {
          setError(errorMessage(initiateBody, t));
          toast.show({ tone: "error", title: errorMessageText(initiateBody, t) });
          return;
        }

        const putRes = await fetch(initiateBody.upload.signedUrl, {
          method: "PUT",
          headers: { "content-type": initiateBody.upload.contentType },
          body: file,
        });
        if (!putRes.ok) {
          setError(t("uploadFailed"));
          toast.show({ tone: "error", title: t("uploadFailed") });
          return;
        }

        const completeRes = await fetch("/api/upload/photo/complete", {
          method: "POST",
          headers: { "content-type": "application/json", "x-locale": locale },
          body: JSON.stringify({ photoId: initiateBody.photoId, sessionId, path: initiateBody.upload.path, kind, byteSize: file.size }),
        });
        const completeBody = await completeRes.json();
        if (!completeRes.ok) {
          setError(errorMessage(completeBody, t));
          toast.show({ tone: "error", title: errorMessageText(completeBody, t) });
          return;
        }

        setFiles([]);
        setResetKey((k) => k + 1);
        toast.show({ tone: "success", title: t("processing") });
        // Not `router.refresh()` here — nothing has been inserted yet, so
        // an immediate refresh would show nothing new. Wait for the
        // broadcast (or the fallback ceiling) instead.
        if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
        awaitingPhotoId.current = initiateBody.photoId;
        fallbackTimer.current = setTimeout(resolveAwaited, PROCESSING_TIMEOUT_MS);
      } catch {
        setError(t("uploadFailed"));
        toast.show({ tone: "error", title: t("uploadFailed") });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <FileDrop
        key={resetKey}
        name="file"
        accept={["image/jpeg", "image/png", "image/webp"]}
        maxBytes={imageLimitMb * 1024 * 1024}
        // `t.markup`, not plain `t` — see materials/upload-form.tsx's
        // identical comment for why.
        requirements={[t.markup("requirement", { limitMb: imageLimitMb, bdi: (chunks) => chunks })]}
        onFiles={setFiles}
      />
      {error ? (
        <Panel tone="error" className="flex items-start gap-2 p-3">
          <AlertCircleIcon aria-hidden className="mt-0.5 shrink-0" />
          <p className="text-body-sm text-fg-heading">{error}</p>
        </Panel>
      ) : null}
      {/* ★ the lead's live-build review: an enabled dark primary under an
          empty drop zone reads as a dead button — disabled until there is
          something to submit, not just while busy. */}
      <Button type="button" onClick={handleSubmit} disabled={files.length === 0} pending={pending} pendingLabel={t("uploading")} size="sm" className="self-start">
        {t("action")}
      </Button>
    </div>
  );
}

function errorMessage(body: { error?: string; limitMb?: number }, t: ReturnType<typeof useTranslations>): ReactNode {
  switch (body.error) {
    case "not_authorized":
      return t("notAuthorized");
    case "file_too_large":
      return t.rich("sizeLimitExceeded", { limitMb: body.limitMb ?? 0, bdi: (chunks) => <bdi>{chunks}</bdi> });
    default:
      return t("uploadFailed");
  }
}

/** The same failure, as a plain string — see `materials/upload-form.tsx`'s
 *  identical helper for why `t.markup`, not `.rich`, is what a toast needs. */
function errorMessageText(body: { error?: string; limitMb?: number }, t: ReturnType<typeof useTranslations>): string {
  switch (body.error) {
    case "not_authorized":
      return t("notAuthorized");
    case "file_too_large":
      return t.markup("sizeLimitExceeded", { limitMb: body.limitMb ?? 0, bdi: (chunks) => chunks });
    default:
      return t("uploadFailed");
  }
}
