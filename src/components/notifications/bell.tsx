import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/components/sessions/numerals";
import { BellIcon } from "@/components/ui/icons";
import { getUnreadCount } from "@/lib/dal/notifications";

// The bell, in the rebuilt shell's top row (REQ-UIX-054; `Home.dc.html` and
// `HomeDesktop.dc.html`): a 40 px round control, the glyph alone at every width,
// and the unread count as a small chip on its corner. Its contract is wave 2's
// and unchanged — a server component, a link to the inbox, the count in its
// accessible name for everyone.
//
// ★ The count's chip wears `signal`, the playground's attention colour, and not a
// status colour: unread is not a session's state (DEC-073).
export async function NotificationBell({ locale }: { memberId?: string; locale: string }) {
  const t = await getTranslations("notifications");
  const unread = await getUnreadCount(locale);
  return (
    <Link
      href="/app/me/notifications"
      aria-label={t("bell.unread", { count: unread, value: formatNumber(unread) })}
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-edge bg-surface text-fg-heading hover:bg-hover focus-visible:outline-[length:var(--focus-width)] focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
    >
      <BellIcon aria-hidden="true" className="text-[1.125rem]" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute end-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-[var(--surface)] bg-signal px-1 text-[0.625rem] leading-none font-extrabold text-on-signal"
        >
          {formatNumber(unread)}
        </span>
      ) : null}
    </Link>
  );
}
