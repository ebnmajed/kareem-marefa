"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import type { FileDropProps } from "@/components/ui";
import { Progress } from "@/components/ui/progress";
import { AlertCircleIcon, CloseIcon, UploadIcon } from "@/components/ui/icons";

// content's file — `16` §4.2 Form. `content` owns every upload path in the
// product (`app/api/{upload,materials,photos}/**`, `lib/storage/**`), which
// is why this control is its.
//
// ★ THIS IS THE CONTROL, NOT THE ENFORCEMENT. `accept`/`maxBytes` drive a
// client-side, advisory pre-check only — shown per file so a member does not
// wait for a round trip to learn a PDF-only slot rejected their PowerPoint —
// but the real rule is content-sniffed server-side after the bytes land, and
// there is no SVG anywhere (invariant 11, DEC-009). A file this component
// waves through can still be refused by the server; a file it flags is
// simply excluded from `onFiles` so nothing is sent for a mistake the UI
// already caught, matching the caller's declared `accept`/`maxBytes` exactly
// and nothing more.
//
// Two paths to the same picker, both real: drag-and-drop, and a genuinely
// keyboard-reachable `<button>` that opens the native file dialog — drag
// alone is never sufficient (native HTML5 drag-and-drop has no keyboard
// equivalent). The underlying `<input type="file">` is `hidden` rather than
// visually-hidden-but-focusable, so it is not a second, invisible tab stop
// beside the button that opens it.
//
// No live upload-progress wiring exists in M9 (`FileDropProps` carries no
// progress channel back in) — each pending file shows `Progress` in its
// indeterminate mode, honestly representing "selected, not yet sent" rather
// than a real percentage this control has no way to know.

interface Picked {
  id: string;
  file: File;
  error?: string;
}

function typeAccepted(file: File, accept: string[]): boolean {
  if (accept.length === 0) return true;
  return accept.some((pattern) => {
    if (pattern.endsWith("/*")) return file.type.startsWith(pattern.slice(0, -1));
    if (pattern.startsWith(".")) return file.name.toLowerCase().endsWith(pattern.toLowerCase());
    return file.type === pattern;
  });
}

export function FileDrop({ name, accept, maxBytes, multiple, requirements, onFiles, disabled, invalid, className = "" }: FileDropProps) {
  const t = useTranslations("browse.fileDrop");
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    onFiles?.(picked.filter((p) => !p.error).map((p) => p.file));
    // `onFiles` is deliberately in the dependency array, not held in a ref:
    // mutating a ref's `.current` during render is exactly what the newer
    // `react-hooks/refs` lint rule forbids, and the effect firing an extra,
    // idempotent time when a caller passes a fresh inline function is a far
    // smaller cost than that.
  }, [picked, onFiles]);

  function ingest(list: FileList | null) {
    if (!list || list.length === 0) return;
    const next: Picked[] = Array.from(list).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      error: !typeAccepted(file, accept) ? t("unsupportedType") : file.size > maxBytes ? t("tooLarge") : undefined,
    }));
    setPicked((prev) => (multiple ? [...prev, ...next] : next));
  }

  function remove(id: string) {
    setPicked((prev) => prev.filter((p) => p.id !== id));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    if (!disabled) ingest(event.dataTransfer.files);
  }

  return (
    <div className={className}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-card border-2 border-dashed px-6 py-8 text-center transition-colors duration-150 ${
          dragOver ? "border-navy-700 bg-silver-100" : invalid ? "border-error-border" : "border-edge-strong"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <UploadIcon aria-hidden className="text-[1.5rem] text-fg-muted" />
        {/* ★ the lead's live-build review: the button IS the primary
            affordance (it is what a keyboard user reaches — drag alone has
            no keyboard equivalent, this file's own header), so it comes
            first; "أو اسحب…" ("or drag…") reads as the choice's alternative
            only when it follows the choice, not precedes it. */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-11 items-center rounded-field border border-edge-strong px-5 text-label text-fg-heading hover:bg-silver-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("chooseFiles")}
        </button>
        <p className="text-body-sm text-fg-muted">{t("dropHint")}</p>
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept={accept.join(",")}
          multiple={multiple}
          disabled={disabled}
          // The native `hidden` attribute, not only a `display:none` class:
          // browsers still allow a `.click()` on a hidden file input to open
          // the OS dialog, and unlike a class it is a real signal a
          // stylesheet is not required to interpret (axe/AT included).
          hidden
          onChange={(event) => {
            ingest(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {requirements?.length ? (
        <ul className="mt-2 flex flex-col gap-0.5 text-caption text-fg-muted">
          {requirements.map((requirement, index) => (
            <li key={index}>{requirement}</li>
          ))}
        </ul>
      ) : null}

      {picked.length > 0 ? (
        <ul aria-live="polite" className="mt-3 flex flex-col gap-2">
          {picked.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-field border border-edge p-2">
              <div className="min-w-0 flex-1">
                {/* `break-words`, never `truncate` — `overflow: hidden` on a
                    text line clips tashkeel, and a file name can be Arabic. */}
                <p className="break-words text-body-sm text-fg-heading">
                  <bdi>{p.file.name}</bdi>
                </p>
                {p.error ? (
                  <p className="mt-0.5 flex items-center gap-1 text-caption text-error">
                    <AlertCircleIcon aria-hidden />
                    {p.error}
                  </p>
                ) : (
                  <div className="mt-1">
                    <Progress label={t("queued", { file: p.file.name })} />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label={t("removeFile", { file: p.file.name })}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-silver-100 hover:text-fg-heading"
              >
                <CloseIcon aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
