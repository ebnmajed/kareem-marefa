"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toggleBookmarkAction } from "@/components/search/actions";

interface BookmarkButtonProps {
  locale: string;
  sessionId: string;
  initialBookmarked: boolean;
}

/** REQ-DSC-006 — a small reusable toggle for another track's page to embed on a session card or
 *  the event page (this track owns no session-listing page itself, SCR-011/SCR-012 are
 *  `sessions`'; `initialBookmarked` has to come from the embedding page's own data fetch, e.g.
 *  `isSessionBookmarked()`, src/lib/dal/bookmarks.ts). */
export function BookmarkButton({ locale, sessionId, initialBookmarked }: BookmarkButtonProps) {
  const t = useTranslations("search.bookmarkButton");
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !bookmarked;
    setBookmarked(next); // optimistic — REQ-EVT-010's "no refresh" spirit applies here too
    startTransition(async () => {
      const result = await toggleBookmarkAction(locale, sessionId, next);
      if (result.error) setBookmarked(!next); // roll back on failure
    });
  }

  return (
    <button type="button" onClick={toggle} disabled={pending} aria-pressed={bookmarked} className="text-body-sm text-fg-body underline hover:text-fg-heading disabled:opacity-40">
      {bookmarked ? t("remove") : t("add")}
    </button>
  );
}
