"use client";

import { createContext, useContext, useState, useTransition, type MouseEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toggleBookmarkAction } from "@/components/search/actions";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { BookmarkFilledIcon, BookmarkIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";

/**
 * ★ wave 20 (DEC-218 §4.4), add-only: what a list around the buttons hears. `pending` right after the optimistic
 * flip, then `saved` or `failed` once the action answers. `SessionRow` is a Server Component that renders this
 * button itself, so a page cannot hand it a function (DEC-159); a client list provides this context around the rows
 * instead — the bookmarks page drops a row at once and offers the undo. With no provider nothing is called, and the
 * button behaves exactly as it always has.
 */
export interface BookmarkChange {
  sessionId: string;
  bookmarked: boolean;
  status: "pending" | "saved" | "failed";
}

const BookmarkChangeContext = createContext<((change: BookmarkChange) => void) | null>(null);

export function BookmarkChangeProvider({ onChange, children }: { onChange: (change: BookmarkChange) => void; children: ReactNode }) {
  return <BookmarkChangeContext.Provider value={onChange}>{children}</BookmarkChangeContext.Provider>;
}

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
  const onChange = useContext(BookmarkChangeContext);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, startTransition] = useTransition();

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
    onChange?.({ sessionId, bookmarked: next, status: "pending" });
    startTransition(async () => {
      const result = await toggleBookmarkAction(locale, sessionId, next);
      if (result.error) {
        setBookmarked(!next);
        toast.show({ title: t("failed"), tone: "error" });
      }
      onChange?.({ sessionId, bookmarked: next, status: result.error ? "failed" : "saved" });
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
