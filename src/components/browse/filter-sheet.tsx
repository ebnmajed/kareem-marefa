"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

// SCR-011's responsive filter placement (09 §4): "filters in a bottom sheet,
// not a sidebar" at phone width, "the filter rail on the inline-start side"
// at desktop. This wrapper owns ONLY the placement and the open/close state
// — the filter form itself is `<SearchFilters>` (content's), passed in as
// `children` so the server component that fetches its own option lists
// stays a server component; only this shell needs client state.
export function FilterSheet({ children }: { children: ReactNode }) {
  const t = useTranslations("browse.filterSheet");
  const [open, setOpen] = useState(false);

  // Locking scroll while the sheet is open keeps the page behind it from
  // scrolling out from under a fixed-position panel — a common bottom-sheet
  // trap at phone width.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* Desktop: an always-visible inline-start rail (09 §4). */}
      <aside className="hidden md:block md:w-72 md:shrink-0">{children}</aside>

      {/* Phone/tablet: a toggle button and a bottom sheet, never a sidebar. */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="inline-flex h-11 items-center rounded-field border border-edge-strong px-4 text-label text-fg-heading"
        >
          {t("open")}
        </button>

        {open ? (
          <div className="fixed inset-0 z-50" role="presentation">
            <div className="absolute inset-0 bg-fg-heading/40" onClick={() => setOpen(false)} aria-hidden="true" />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t("title")}
              className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-edge bg-canvas p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-h3 text-fg-heading">{t("title")}</h2>
                <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 items-center rounded-field px-3 text-label text-fg-body hover:bg-silver-100">
                  {t("close")}
                </button>
              </div>
              <div className="mt-3">{children}</div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
