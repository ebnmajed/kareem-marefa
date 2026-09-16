"use client";

import { useCallback, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FileDrop } from "@/components/ui/file-drop";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { usePendingNudge } from "@/components/ui/pending-nudge";
import { AlertCircleIcon } from "@/components/ui/icons";
import type { MaterialKind, MaterialUploadLimits } from "@/lib/dal/materials";

// STORY-MAT-001, 07 §1 — the browser uploads directly to Storage; bytes
// never traverse this app's own server. A plain `fetch(signedUrl, { method:
// "PUT" })` does the actual transfer: `createSignedUploadUrl()`'s own
// `signedUrl` is already a self-authenticating URL, so no extra header is
// needed. This avoids the one alternative, the browser Supabase client's
// `uploadToSignedUrl()` helper, which would be the first use of that client
// for anything but auth UI/Realtime (DEC-020) — flagged to the lead rather
// than decided here, since a plain fetch works and settles it without
// touching that boundary at all.
//
// No third-party dependency: FormData + fetch, Node/Web built-ins only.
//
// ★ REQ-UIX-024, wave 6: the picker is `ui/file-drop` — visible controls
// (drag-and-drop AND a genuinely keyboard-reachable button), stating what it
// accepts and how large BEFORE a file is chosen. `uploadLimits` (from
// `getMaterialsPageData`/`getProposalMaterialsPageData`, `content.md` §2.3)
// is what makes the size half honest: previously the limit was only ever
// learned from a 413 response, after the fact.

// DEC-058: uploads are PDF-only — no PowerPoint, no Keynote.
const FILE_KINDS = ["pdf", "image", "audio"] as const;
const LINK_KINDS = ["video_link", "external_link"] as const;

type UploadKind = MaterialKind;

function guessKindFromFilename(name: string): Exclude<UploadKind, "video_link" | "external_link"> | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "image";
  if (["mp3", "m4a", "wav", "ogg"].includes(ext)) return "audio";
  return null;
}

type UploadFormProps = { locale: string; uploadLimits: MaterialUploadLimits } & (
  | { sessionId: string; proposalId?: undefined }
  | { proposalId: string; sessionId?: undefined }
);

/** REQ-PRO-004: the same form, for either a session's materials or a proposal's draft materials —
 *  exactly one of `sessionId`/`proposalId` is passed, matching `initiateMaterialUploadInput`'s own
 *  either/or (src/lib/dal/materials.ts). A proposal upload hides the phase selector: "before/after
 *  the session" has no meaning yet for a draft that carries no session at all. */
export function UploadForm({ locale, sessionId, proposalId, uploadLimits }: UploadFormProps) {
  const t = useTranslations("materials.upload");
  // Kind/phase option labels reuse the `materials.list` namespace's own
  // `kind.*`/`phase.*` keys (message keys are stable — CLAUDE.md, Naming —
  // so the same five kind labels and two phase labels shown on the list are
  // never re-authored a second time here).
  const tList = useTranslations("materials.list");
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<UploadKind>("pdf");
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<"before" | "after">("after");
  const [externalUrl, setExternalUrl] = useState("");
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

  const isFileKind = (FILE_KINDS as readonly string[]).includes(kind);
  const isLinkKind = (LINK_KINDS as readonly string[]).includes(kind);

  const limitMb = kind === "audio" ? uploadLimits.audioMb : kind === "image" ? uploadLimits.imageMb : uploadLimits.documentMb;
  const accept = kind === "pdf" ? ["application/pdf", ".pdf"] : kind === "image" ? ["image/png", "image/jpeg", "image/webp"] : ["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg"];
  const requirementKey = kind === "pdf" ? "requirementPdf" : kind === "image" ? "requirementImage" : "requirementAudio";

  // ★ `useCallback`, not an inline arrow in the JSX below — `FileDrop`'s own
  // effect (`file-drop.tsx`) depends on `onFiles` by reference, so a fresh
  // closure every render re-fires it every render: it calls `onFiles` with a
  // new (structurally empty, referentially distinct) array, which calls
  // `setFiles`, which re-renders this component, which creates ANOTHER fresh
  // closure — an infinite loop that starved a real test run for minutes
  // before this fix, not a hypothetical. `[kind]` because the handler reads
  // `kind` to decide whether to auto-switch it.
  const handleFiles = useCallback(
    (picked: File[]) => {
      const guessed = picked[0] ? guessKindFromFilename(picked[0].name) : null;
      if (guessed && guessed !== kind) setKind(guessed);
      setFiles(picked);
    },
    [kind],
  );

  function handleSubmit() {
    setError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t("titleRequired"));
      return;
    }
    const file = isFileKind ? (files[0] ?? null) : null;
    if (isFileKind && !file) {
      setError(t("fileRequired"));
      return;
    }
    const trimmedUrl = isLinkKind ? externalUrl.trim() : undefined;

    // `router.refresh()` at the end is the LAST statement inside this SAME
    // `startTransition` — `pending` (the uploader's busy state) honestly
    // lasts until the refreshed material list has actually committed, not
    // just until the upload's own requests finish. See the `usePendingNudge`
    // note above for why this reliably commits at all (`DEC-135`).
    //
    // ★ The lead's real-build finding on the event page's discussion (the
    // identical shape here): a request that fails at the NETWORK level
    // (offline, a dropped connection) makes `fetch` REJECT rather than
    // resolve to a response — left uncaught, that throw would propagate out
    // of this `startTransition` callback and React would replace the whole
    // page with the route's error boundary. Caught below; the typed
    // title/file selection are untouched on that path, and `router.refresh()`
    // is never reached.
    startTransition(async () => {
      try {
        const initiateRes = await fetch("/api/upload/material", {
          method: "POST",
          headers: { "content-type": "application/json", "x-locale": locale },
          body: JSON.stringify({
            ...(sessionId ? { sessionId } : { proposalId }),
            kind,
            title: trimmedTitle,
            phase,
            ...(file ? { filename: file.name, declaredByteSize: file.size } : {}),
            ...(trimmedUrl ? { externalUrl: trimmedUrl } : {}),
          }),
        });
        const initiateBody = await initiateRes.json();
        if (!initiateRes.ok) {
          setError(errorMessage(initiateBody, t));
          toast.show({ tone: "error", title: errorMessageText(initiateBody, t) });
          return;
        }

        if (file && initiateBody.upload) {
          const putRes = await fetch(initiateBody.upload.signedUrl, { method: "PUT", headers: { "content-type": file.type || "application/octet-stream" }, body: file });
          if (!putRes.ok) {
            setError(t("uploadFailed"));
            toast.show({ tone: "error", title: t("uploadFailed") });
            return;
          }

          const completeRes = await fetch("/api/upload/material/complete", {
            method: "POST",
            headers: { "content-type": "application/json", "x-locale": locale },
            body: JSON.stringify({ materialId: initiateBody.materialId, path: initiateBody.upload.path, declaredKind: kind }),
          });
          const completeBody = await completeRes.json();
          if (!completeRes.ok) {
            setError(errorMessage(completeBody, t));
            toast.show({ tone: "error", title: errorMessageText(completeBody, t) });
            return;
          }
        }

        setTitle("");
        setExternalUrl("");
        setFiles([]);
        setResetKey((k) => k + 1);
        toast.show({ tone: "success", title: t("success") });
        router.refresh();
      } catch {
        setError(t("uploadFailed"));
        toast.show({ tone: "error", title: t("uploadFailed") });
      }
    });
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-card border border-edge p-4">
      <label className="flex flex-col gap-1 text-body-sm text-fg-body">
        {t("kindLabel")}
        <Select value={kind} onChange={(e) => setKind(e.target.value as UploadKind)}>
          <option value="pdf">{tList("kind.pdf")}</option>
          <option value="image">{tList("kind.image")}</option>
          <option value="audio">{tList("kind.audio")}</option>
          <option value="video_link">{tList("kind.video_link")}</option>
          <option value="external_link">{tList("kind.external_link")}</option>
        </Select>
      </label>

      <label className="flex flex-col gap-1 text-body-sm text-fg-body">
        {t("titleLabel")}
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} size="sm" />
      </label>

      {sessionId ? (
        <label className="flex flex-col gap-1 text-body-sm text-fg-body">
          {t("phaseLabel")}
          <Select value={phase} onChange={(e) => setPhase(e.target.value as "before" | "after")}>
            <option value="before">{tList("phase.before")}</option>
            <option value="after">{tList("phase.after")}</option>
          </Select>
        </label>
      ) : null}

      {isFileKind ? (
        <FileDrop
          key={resetKey}
          name="file"
          accept={accept}
          maxBytes={limitMb * 1024 * 1024}
          // `t.markup`, not plain `t` — the message wraps {limitMb} in its
          // own <bdi> (the content-i18n catalogue gate requires it on any
          // non-plural interpolation); `FileDrop.requirements` takes plain
          // strings, so the tag is processed away rather than rendered as JSX.
          requirements={[t.markup(requirementKey, { limitMb, bdi: (chunks) => chunks })]}
          onFiles={handleFiles}
        />
      ) : null}

      {isLinkKind ? (
        <label className="flex flex-col gap-1 text-body-sm text-fg-body">
          {t("urlLabel")}
          <Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} type="url" required placeholder="https://" dir="ltr" size="sm" />
        </label>
      ) : null}

      <p className="text-body-sm text-fg-muted">{t("notice")}</p>
      {error ? (
        <Panel tone="error" className="flex items-start gap-2 p-3">
          <AlertCircleIcon aria-hidden className="mt-0.5 shrink-0" />
          <p className="text-body-sm text-fg-heading">{error}</p>
        </Panel>
      ) : null}

      {/* ★ the lead's live-build review of the sibling photos uploader: an
          enabled dark primary under nothing to submit reads as dead — same
          fix here, disabled until title + (a file or a link) is ready, not
          just while busy. */}
      <Button
        type="button"
        onClick={handleSubmit}
        disabled={title.trim().length === 0 || (isFileKind && files.length === 0) || (isLinkKind && externalUrl.trim().length === 0)}
        pending={pending}
        pendingLabel={t("uploading")}
        size="sm"
        className="self-start"
      >
        {t("submit")}
      </Button>
    </div>
  );
}

function errorMessage(body: { error?: string; limitMb?: number; sniffedKind?: string }, t: ReturnType<typeof useTranslations>): ReactNode {
  switch (body.error) {
    case "not_authorized":
      return t("notAuthorized");
    case "file_too_large":
      return t.rich("sizeLimitExceeded", { limitMb: body.limitMb ?? 0, bdi: (chunks) => <bdi>{chunks}</bdi> });
    case "sniff_mismatch":
      return t("sniffMismatch");
    default:
      return t("uploadFailed");
  }
}

/** The same failure, as a plain string — `ToastOptions.title` takes no JSX.
 *  `t.markup` (not `.rich`) processes the message's own `<bdi>` tag into a
 *  string by discarding the wrapper and keeping its content, exactly the
 *  pattern `viewer/page-viewer.tsx`'s `aria-label` already uses for the same
 *  reason. */
function errorMessageText(body: { error?: string; limitMb?: number; sniffedKind?: string }, t: ReturnType<typeof useTranslations>): string {
  switch (body.error) {
    case "not_authorized":
      return t("notAuthorized");
    case "file_too_large":
      return t.markup("sizeLimitExceeded", { limitMb: body.limitMb ?? 0, bdi: (chunks) => chunks });
    case "sniff_mismatch":
      return t("sniffMismatch");
    default:
      return t("uploadFailed");
  }
}
