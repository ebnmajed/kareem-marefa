import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/components/sessions/numerals";
import { BellIcon } from "@/components/ui/icons";
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
      className="relative inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-field px-2.5 text-label text-fg-body hover:bg-silver-100 hover:text-fg-heading md:px-3"
    >
      {/* ★ The BELL glyph, at icon size, on every width (DEC-111). It was the
          house DOT at 8 px below `md` — which read as a stray full stop between
          the search glyph and the avatar, not as a control. The label joins it
          from `md` up; the aria-label above names it for everyone. */}
      <BellIcon aria-hidden="true" className="text-[1.25rem]" />
      <span aria-hidden="true" className="hidden md:inline">{t("bell.label")}</span>
      {unread > 0 ? (
        <span
          aria-hidden="true"
          // A notification count is a dot (DEC-079 condition 2): a small badge
          // on the bell's inline-end shoulder below `md`, beside the label above it.
          className="absolute -top-0.5 end-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--btn-bg)] px-1 text-[0.6875rem] leading-none text-[var(--btn-fg)] md:static md:h-6 md:min-w-6 md:px-2 md:text-caption"
        >
          {formatNumber(unread)}
        </span>
      ) : null}
    </Link>
  );
}
