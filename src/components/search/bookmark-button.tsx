"use client";

import { useState, useTransition, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { toggleBookmarkAction } from "@/components/search/actions";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { BookmarkFilledIcon, BookmarkIcon } from "@/components/ui/icons";
import { usePendingNudge } from "@/components/ui/pending-nudge";
import { useToast } from "@/components/ui/toast";

interface BookmarkButtonProps {
  locale: string;
  sessionId: string;
  initialBookmarked: boolean;
  /** `icon` on a card and in the phone's action bar; `button` in the event page's action card. */
  variant?: "icon" | "button";
  className?: string;
}

/**
 * REQ-DSC-006 — «احفظ», a private toggle that earns nothing.
 *
 * ★ A TOGGLE KEEPS ITS NAME and says its state with `aria-pressed`. The old
 * text link swapped «أضف إلى المحفوظات» for «إزالة من المحفوظات», so a screen
 * reader heard a different control after every press and a member hunting for
 * the button by its name lost it. The glyph fills when pressed, so the state
 * is not colour alone either (REQ-UIX-003's rule, applied to a control).
 *
 * Optimistic, and that is deliberate: `16` §7.1 layer 4 names bookmarks as the
 * one place optimism is right — nothing is contended. A failure rolls back and
 * says so in a toast that stays until dismissed (§7.3), because the button the
 * member pressed may already be scrolled away.
 */
export function BookmarkButton({ locale, sessionId, initialBookmarked, variant = "icon", className = "" }: BookmarkButtonProps) {
  const t = useTranslations("search.bookmarkButton");
  const toast = useToast();
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, startTransition] = useTransition();
  // The action revalidates the event page, so its response re-renders server
  // content inside this transition — the case React 19.2 can lose (DEC-135).
  usePendingNudge(pending);

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    // ★ On a timeline card this button sits inside the card's own link.
    // `CardActions` stops the click from reaching the link's handler, but
    // stopping propagation does not cancel the ANCHOR's default action — the
    // real build followed the link on every press. Cancelling it here is what
    // keeps a bookmark a bookmark.
    event.preventDefault();
    event.stopPropagation();
    const next = !bookmarked;
    setBookmarked(next);
    startTransition(async () => {
      const result = await toggleBookmarkAction(locale, sessionId, next);
      if (result.error) {
        setBookmarked(!next);
        toast.show({ title: t("failed"), tone: "error" });
      }
    });
  }

  const glyph = bookmarked ? <BookmarkFilledIcon /> : <BookmarkIcon />;

  if (variant === "button") {
    return (
      <Button type="button" variant="secondary" size="md" onClick={toggle} aria-pressed={bookmarked} aria-busy={pending || undefined} iconStart={glyph} className={className}>
        {t("short")}
      </Button>
    );
  }

  return (
    <IconButton label={t("icon")} variant="secondary" onClick={toggle} aria-pressed={bookmarked} aria-busy={pending || undefined} className={className}>
      {glyph}
    </IconButton>
  );
}
