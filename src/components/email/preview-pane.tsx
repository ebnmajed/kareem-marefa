"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

// SCR-058's live preview — REQ-NTF-010, `16` §11.4, DEC-161 D2.
//
// ★ A FORM POSTING INTO A NAMED IFRAME, and every part of that is load-bearing.
//
//   · A FORM, because the draft is unsaved blocks — up to 200,000 characters —
//     which do not fit a query string, so the frame cannot be driven by `src`.
//   · NAMED, because `target="mail-preview"` is what makes the POST land in the
//     frame instead of navigating the page away.
//   · NOT `srcdoc`, NOT `blob:`. Both inherit the PARENT's CSP, and every cell
//     of a mail is an inline `style=` by constraint (`08` §3.1) — so the moment
//     `proxy.ts`'s report-only policy is enforced, the preview would render
//     UNSTYLED and an admin would approve a message that is not the one that
//     ships. The route answers with its own policy instead.
//
// ★ AND NO TIMER ANYWHERE (`DEC-146`). The preview refreshes on STRUCTURAL
// change — a block added, removed, reordered, or the mode switched — and on a
// text field's blur, both of which are events. A debounce on every keystroke
// would be a timer on a pending control, which this repository does not do.

export type PreviewMode = "phone" | "desktop" | "text" | "dark";

/** The four modes `16` §11.4 names, and what each is FOR. */
const MODES: { mode: PreviewMode; width: number | null }[] = [
  { mode: "phone", width: 375 },
  { mode: "desktop", width: 640 },
  { mode: "text", width: null },
  { mode: "dark", width: 375 },
];

export function PreviewPane({
  messageKey,
  subject,
  body,
  blocks,
  mode,
  onModeChange,
}: {
  messageKey: string;
  subject: string;
  body: string;
  /** The editor's unsaved document as JSON, or "" for the string path. */
  blocks: string;
  mode: PreviewMode;
  onModeChange: (mode: PreviewMode) => void;
}) {
  const t = useTranslations("notifications.admin.emails.preview");
  const form = useRef<HTMLFormElement>(null);

  // Structural changes and the mode refresh the frame; a text field asks for it
  // on blur. Both are events, never a timer.
  useEffect(() => {
    form.current?.requestSubmit();
  }, [blocks, mode, messageKey]);

  const current = MODES.find((m) => m.mode === mode) ?? MODES[0];
  const isText = mode === "text";

  return (
    <section aria-labelledby="preview-heading" className="min-w-0">
      <h3 id="preview-heading" className="text-label text-fg-heading">
        {t("heading")}
      </h3>

      <div role="radiogroup" aria-label={t("modesLabel")} className="mt-3 flex flex-wrap gap-2">
        {MODES.map(({ mode: value }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => onModeChange(value)}
            className={`min-h-11 rounded-lg border px-3 text-label ${
              mode === value ? "border-edge-strong bg-surface text-fg-heading" : "border-edge text-fg-muted"
            }`}
          >
            {t(`mode.${value}`)}
          </button>
        ))}
      </div>

      {/* ★ The simulation is NAMED, not silent. `dark` appends a style block to
          the rendered bytes, so it is the one mode that is not what ships —
          and an admin is told that rather than left to assume otherwise. */}
      {mode === "dark" ? (
        <p className="mt-2 max-w-prose text-body-sm text-fg-muted">{t("darkNote")}</p>
      ) : null}

      <form
        ref={form}
        method="post"
        action="/api/admin/emails/preview"
        target="mail-preview"
        className="mt-3"
      >
        <input type="hidden" name="key" value={messageKey} readOnly />
        <input type="hidden" name="subject" value={subject} readOnly />
        <input type="hidden" name="body" value={body} readOnly />
        <input type="hidden" name="blocks" value={blocks} readOnly />
        <input type="hidden" name="mode" value={isText ? "text" : "html"} readOnly />
        <input type="hidden" name="simulate" value={mode === "dark" ? "dark" : ""} readOnly />
        {/* The frame refreshes on its own; this is the keyboard path to it and
            the one control a screen reader announces. */}
        <button type="submit" className="min-h-11 rounded-lg border border-edge px-3 text-label text-fg-heading">
          {t("refresh")}
        </button>
      </form>

      <div className="mt-3 overflow-x-auto">
        <iframe
          name="mail-preview"
          title={t("frameTitle")}
          // Everything denied: the mail has no script and needs no origin, so
          // an opaque origin is the correct one.
          sandbox=""
          referrerPolicy="no-referrer"
          // Eager: a lazy frame in a capture proves nothing (wave 8's trap).
          loading="eager"
          className="block h-[36rem] rounded-xl border border-edge bg-canvas"
          style={{ width: current.width ? `${current.width}px` : "100%", maxWidth: "100%" }}
        />
      </div>
    </section>
  );
}
