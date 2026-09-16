"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { usePendingNudge } from "@/components/ui/pending-nudge";
import { AlertCircleIcon } from "@/components/ui/icons";
import type { PhotoKind } from "@/lib/dal/photos";

// REQ-EVT-009/010/011/013 — the same shape as src/components/materials/
// upload-form.tsx (plain fetch PUT to a signed URL, bytes never traverse
// this app's server, no browser Supabase client — see that file's header
// for the DEC-020 reasoning, identical here). The one real difference: the
// `complete` call never reports back a finished photo — `process_photo`
// (the worker) still has to download, sniff, strip and insert the row, so
// this only confirms the request was accepted (202) and then refreshes;
// the photo appears once the job finishes, same as any other async job in
// this product surfacing through a page revisit rather than a promise this
// component can await to completion. ★ That gap against `REQ-EVT-010`'s
// literal "appears at once" is real and recorded, not fixed this wave
// (docs/plan/notes/content.md §3, §4.4) — the success state below is
// honest about it ("processing", not "posted").
//
// ★ REQ-UIX-024, wave 6: `ui/file-drop` states JPEG/PNG/WebP and the org's
// own size limit BEFORE a file is chosen.

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

  // `DEC-135`: `router.refresh()` at the end of `handleSubmit` below is
  // tracked by this SAME `useTransition`, so its `pending` honestly lasts
  // until the refresh has committed — and React 19.2.4 can lose the ping
  // that would otherwise resume that commit, so `usePendingNudge` re-renders
  // this component every 300ms while pending to force the retry through.
  usePendingNudge(pending);

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

    // `router.refresh()` at the end is the LAST statement inside this SAME
    // `startTransition` — `pending` (the uploader's busy state) honestly
    // lasts until the refreshed gallery has actually committed.
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
        router.refresh();
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
