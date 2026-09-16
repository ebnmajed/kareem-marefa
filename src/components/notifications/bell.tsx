import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/components/sessions/numerals";
import { DotIcon } from "@/components/ui/icons";
import { getUnreadCount } from "@/lib/dal/notifications";

// The shell slot (TEAM.md §2): <NotificationBell memberId locale /> — a
// server component that owns its data through the notifications DAL, takes
// ids and never rows, and renders NO heading of its own.
//
// `memberId` is the shell's statement of whose bell this is. It is NOT the
// authority: the count is read for the session's own member, because a prop
// is something the caller chose and `requireSession()` is something the
// cookie proved. They agree in the shell; if they ever did not, believing the
// prop would be the bug.
//
// REQ-NTF-006 wants the count accurate across devices, so it is counted at
// the database on every render rather than cached anywhere.

export async function NotificationBell({ locale }: { memberId?: string; locale: string; }) {
  const t = await getTranslations("notifications");
  const unread = await getUnreadCount(locale);

  return (
    <Link
      href="/app/me/notifications"
      aria-label={t("bell.unread", { count: unread, value: formatNumber(unread) })}
      className="inline-flex h-10 items-center gap-1 rounded-field px-2 text-label md:gap-2 md:px-3 text-fg-body hover:bg-silver-100 hover:text-fg-heading"
    >
      {/* Compact at phone width (the shell must stay one row at 390 px, REQ-SES-013):
          the house dot glyph carries the link, the label appears from md up; the
          aria-label above names it for everyone. */}
      <DotIcon aria-hidden="true" className="h-2 w-2 md:hidden" />
      <span aria-hidden="true" className="hidden md:inline">{t("bell.label")}</span>
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--btn-bg)] px-2 text-body-sm text-[var(--btn-fg)]"
        >
          {formatNumber(unread)}
        </span>
      ) : null}
    </Link>
  );
}
