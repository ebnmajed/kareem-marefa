"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { MaterialKind } from "@/lib/dal/materials";

// STORY-MAT-001, 07 §1 — the browser uploads directly to Storage; bytes
// never traverse this app's own server. A plain `fetch(signedUrl, { method:
// "PUT" })` does the actual transfer: `createSignedUploadUrl()`'s own
// `signedUrl` is already a self-authenticating URL (the same shape
// worker/src/content/storage.ts mints for the converter, whose own
// `upload()` — converter/server.mjs — does exactly this, no extra header).
// This avoids the one alternative, the browser Supabase client's
// `uploadToSignedUrl()` helper, which would be the first use of that client
// for anything but auth UI/Realtime (DEC-020) — flagged to the lead rather
// than decided here, since a plain fetch works and settles it without
// touching that boundary at all.
//
// No third-party dependency: FormData + fetch, Node/Web built-ins only.

const FILE_KINDS = ["pdf", "powerpoint", "keynote", "image", "audio"] as const;
const LINK_KINDS = ["video_link", "external_link"] as const;

type UploadKind = MaterialKind;

function guessKindFromFilename(name: string): Exclude<UploadKind, "video_link" | "external_link"> | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "ppt" || ext === "pptx") return "powerpoint";
  if (ext === "key") return "keynote";
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "image";
  if (["mp3", "m4a", "wav", "ogg"].includes(ext)) return "audio";
  return null;
}

type UploadFormProps = { locale: string } & ({ sessionId: string; proposalId?: undefined } | { proposalId: string; sessionId?: undefined });

/** REQ-PRO-004: the same form, for either a session's materials or a proposal's draft materials —
 *  exactly one of `sessionId`/`proposalId` is passed, matching `initiateMaterialUploadInput`'s own
 *  either/or (src/lib/dal/materials.ts). A proposal upload hides the phase selector: "before/after
 *  the session" has no meaning yet for a draft that carries no session at all. */
export function UploadForm({ locale, sessionId, proposalId }: UploadFormProps) {
  const t = useTranslations("materials.upload");
  // Kind/phase option labels reuse the `materials.list` namespace's own
  // `kind.*`/`phase.*` keys (message keys are stable — CLAUDE.md, Naming —
  // so the same six kind labels and two phase labels shown on the list are
  // never re-authored a second time here).
  const tList = useTranslations("materials.list");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<UploadKind>("pdf");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReactNode>(null);

  const isFileKind = (FILE_KINDS as readonly string[]).includes(kind);
  const isLinkKind = (LINK_KINDS as readonly string[]).includes(kind);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError(null);
    setBusy(true);
    try {
      const title = String(formData.get("title") ?? "").trim();
      const phase = String(formData.get("phase") ?? "after") as "before" | "after";
      // Read the file straight off the input element, not through `FormData`
      // — jsdom's `new FormData(form)` does not carry a file input's actual
      // `File` through (size/name come back empty even though the input's
      // own `.files` is correct), a jsdom-only gap that would otherwise make
      // this untestable without touching the real-browser behaviour at all.
      const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
      const file = isFileKind ? (fileInput?.files?.[0] ?? null) : null;
      const externalUrl = isLinkKind ? String(formData.get("externalUrl") ?? "").trim() : undefined;

      if (isFileKind && (!file || file.size === 0)) {
        setError(t("fileRequired"));
        return;
      }

      const initiateRes = await fetch("/api/upload/material", {
        method: "POST",
        headers: { "content-type": "application/json", "x-locale": locale },
        body: JSON.stringify({
          ...(sessionId ? { sessionId } : { proposalId }),
          kind,
          title,
          phase,
          ...(file ? { filename: file.name, declaredByteSize: file.size } : {}),
          ...(externalUrl ? { externalUrl } : {}),
        }),
      });
      const initiateBody = await initiateRes.json();
      if (!initiateRes.ok) {
        setError(errorMessage(initiateBody, t));
        return;
      }

      if (file && initiateBody.upload) {
        const putRes = await fetch(initiateBody.upload.signedUrl, { method: "PUT", headers: { "content-type": file.type || "application/octet-stream" }, body: file });
        if (!putRes.ok) {
          setError(t("uploadFailed"));
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
          return;
        }
      }

      formRef.current?.reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 rounded-field border border-edge p-4">
      <label className="flex flex-col gap-1 text-body-sm text-fg-body">
        {t("kindLabel")}
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as UploadKind)} className="rounded-field border border-edge-strong bg-canvas px-2 py-1 text-body-sm text-fg-heading">
          <option value="pdf">{tList("kind.pdf")}</option>
          <option value="powerpoint">{tList("kind.powerpoint")}</option>
          <option value="keynote">{tList("kind.keynote")}</option>
          <option value="image">{tList("kind.image")}</option>
          <option value="audio">{tList("kind.audio")}</option>
          <option value="video_link">{tList("kind.video_link")}</option>
          <option value="external_link">{tList("kind.external_link")}</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-body-sm text-fg-body">
        {t("titleLabel")}
        <input name="title" required maxLength={200} className="rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body text-fg-heading" />
      </label>

      {sessionId ? (
        <label className="flex flex-col gap-1 text-body-sm text-fg-body">
          {t("phaseLabel")}
          <select name="phase" defaultValue="after" className="rounded-field border border-edge-strong bg-canvas px-2 py-1 text-body-sm text-fg-heading">
            <option value="before">{tList("phase.before")}</option>
            <option value="after">{tList("phase.after")}</option>
          </select>
        </label>
      ) : null}

      {isFileKind ? (
        <label className="flex flex-col gap-1 text-body-sm text-fg-body">
          {t("fileLabel")}
          <input
            key={kind}
            type="file"
            name="file"
            // Not `required`: jsdom's file input never clears
            // `validity.valueMissing` after `files` is set programmatically
            // (a jsdom limitation, not a real-browser one), which silently
            // blocks native form submission in tests. The presence check
            // below (`fileRequired`) is the real validation either way.
            onChange={(e) => {
              const guessed = e.target.files?.[0] ? guessKindFromFilename(e.target.files[0].name) : null;
              if (guessed) setKind(guessed);
            }}
          />
        </label>
      ) : null}

      {isLinkKind ? (
        <label className="flex flex-col gap-1 text-body-sm text-fg-body">
          {t("urlLabel")}
          <input name="externalUrl" type="url" required placeholder="https://" dir="ltr" className="rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body text-fg-heading" />
        </label>
      ) : null}

      <p className="text-body-sm text-fg-muted">{t("notice")}</p>
      {error ? <p className="text-body-sm text-fg-heading">{error}</p> : null}

      <button type="submit" disabled={busy} className="self-start rounded-field border border-edge-strong px-4 py-2 text-label text-fg-heading disabled:opacity-40 w-fit">
        {t("submit")}
      </button>
    </form>
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
