"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
// component can await to completion.

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
}

export function UploadWidget({ locale, sessionId }: UploadWidgetProps) {
  const t = useTranslations("photos.upload");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReactNode>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    // Read the file straight off the input element, not through `FormData`
    // — jsdom's `new FormData(form)` does not carry a file input's actual
    // `File` through, a jsdom-only gap (src/components/materials/
    // upload-form.tsx's own note); this is also the more direct approach.
    const file = fileInput?.files?.[0] ?? null;
    if (!file) {
      setError(t("fileRequired"));
      return;
    }
    const kind = sniffKindFromFile(file);
    if (!kind) {
      setError(t("unsupportedType"));
      return;
    }

    setBusy(true);
    try {
      const initiateRes = await fetch("/api/upload/photo", {
        method: "POST",
        headers: { "content-type": "application/json", "x-locale": locale },
        body: JSON.stringify({ sessionId, kind, declaredByteSize: file.size }),
      });
      const initiateBody = await initiateRes.json();
      if (!initiateRes.ok) {
        setError(errorMessage(initiateBody));
        return;
      }

      const putRes = await fetch(initiateBody.upload.signedUrl, {
        method: "PUT",
        headers: { "content-type": initiateBody.upload.contentType },
        body: file,
      });
      if (!putRes.ok) {
        setError(t("uploadFailed"));
        return;
      }

      const completeRes = await fetch("/api/upload/photo/complete", {
        method: "POST",
        headers: { "content-type": "application/json", "x-locale": locale },
        body: JSON.stringify({ photoId: initiateBody.photoId, sessionId, path: initiateBody.upload.path, kind, byteSize: file.size }),
      });
      const completeBody = await completeRes.json();
      if (!completeRes.ok) {
        setError(errorMessage(completeBody));
        return;
      }

      formRef.current?.reset();
      setNotice(t("processing"));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function errorMessage(body: { error?: string; limitMb?: number }): ReactNode {
    switch (body.error) {
      case "not_authorized":
        return t("notAuthorized");
      case "file_too_large":
        return t.rich("sizeLimitExceeded", { limitMb: body.limitMb ?? 0, bdi: (chunks) => <bdi>{chunks}</bdi> });
      default:
        return t("uploadFailed");
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 rounded-field border border-edge p-4">
      <label className="flex flex-col gap-1 text-body-sm text-fg-body">
        {t("fileLabel")}
        <input type="file" name="file" accept="image/jpeg,image/png,image/webp" />
      </label>
      {error ? <p className="text-body-sm text-fg-heading">{error}</p> : null}
      {notice ? <p className="text-body-sm text-fg-muted">{notice}</p> : null}
      <button type="submit" disabled={busy} className="self-start rounded-field border border-edge-strong px-4 py-2 text-label text-fg-heading disabled:opacity-40">
        {t("action")}
      </button>
    </form>
  );
}
