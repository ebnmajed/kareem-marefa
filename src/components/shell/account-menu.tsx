import { Link } from "@/i18n/navigation";
import { Avatar } from "@/components/ui/avatar";
import { ChevronIcon } from "@/components/ui/icons";

// The account menu — `16` §6.1 note 3, DEC-072, REQ-UIX-002.
//
// ★ STAFF LINKS STOP BEING A FONT COLOUR. Today the shell distinguishes «لوحة
// الإدارة» from «الأعضاء» with `text-fg-heading` instead of `text-fg-body`,
// which is not a distinction a moderator can find. They move into a RULED
// SECTION of this menu, labelled, so a moderator looking for their queue has
// somewhere to look.
//
// ★ It is a `<details>`, not a Radix dropdown, and that is deliberate: the
// shell must render without JavaScript, `<details>`/`<summary>` is keyboard-
// and screen-reader-native, and `ui/menu` (Radix, `console`'s) is a CLIENT
// component — putting it in the shell would pull the whole layout into the
// client graph for a disclosure the platform already implements. The current
// shell makes the same choice for the same reason and records it.

export interface AccountMenuProps {
  memberId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isStaff: boolean;
  isPlatformAdmin: boolean;
  labels: {
    account: string;
    profile: string;
    rsvps: string;
    points: string;
    certificates: string;
    bookmarks: string;
    calendar: string;
    staffSection: string;
    admin: string;
    platform: string;
    signOut: string;
  };
}

const item =
  "flex h-11 w-full items-center rounded-field px-3 text-label text-fg-body hover:bg-silver-100 hover:text-fg-heading";

export function AccountMenu({ memberId, displayName, avatarUrl, isStaff, isPlatformAdmin, labels }: AccountMenuProps) {
  const member: { href: string; label: string }[] = memberId
    ? [
        { href: "/app/me", label: labels.profile },
        { href: "/app/me", label: labels.rsvps },
        { href: "/app/me/points", label: labels.points },
        { href: "/app/me/certificates", label: labels.certificates },
        { href: "/app/me/bookmarks", label: labels.bookmarks },
        { href: "/app/me/calendar", label: labels.calendar },
      ]
    : [];

  return (
    <details className="group relative">
      <summary
        className="inline-flex h-11 cursor-pointer list-none items-center gap-1.5 rounded-field px-2 text-label text-fg-heading hover:bg-silver-100 [&::-webkit-details-marker]:hidden"
        aria-label={labels.account}
      >
        {memberId ? (
          <Avatar memberId={memberId} displayName={displayName} src={avatarUrl} size={34} decorative />
        ) : null}
        <ChevronIcon direction="down" className="text-fg-muted" />
      </summary>
      {/* `hidden` until open, then `group-open:block`: a closed <details> keeps
          its content's layout box under content-visibility in Chromium, and an
          absolute panel with a box registers as sideways overflow in the 390 px
          review even though nothing is painted. The current shell learned this
          the hard way and the note is kept. */}
      <div className="absolute inset-inline-end-0 top-12 z-40 hidden w-60 rounded-card border border-edge bg-canvas p-2 shadow-[var(--shadow-card)] group-open:block">
        <ul className="flex flex-col">
          {member.map((link, i) => (
            <li key={`${link.href}-${i}`}>
              <Link href={link.href} className={item}>
                {link.label}
              </Link>
            </li>
          ))}
          {isStaff || isPlatformAdmin ? (
            <>
              {/* The rule and the label together are the whole of note 3: a
                  moderator can see that a staff area exists and where it is. */}
              <li aria-hidden className="my-1 border-t border-edge" />
              <li className="px-3 py-1 text-caption text-fg-muted">{labels.staffSection}</li>
              {isStaff ? (
                <li>
                  <Link href="/app/admin" className={item}>
                    {labels.admin}
                  </Link>
                </li>
              ) : null}
              {isPlatformAdmin ? (
                <li>
                  <Link href="/app/platform" className={item}>
                    {labels.platform}
                  </Link>
                </li>
              ) : null}
            </>
          ) : null}
          <li aria-hidden className="my-1 border-t border-edge" />
          <li>
            <form method="post" action="/api/auth/sign-out">
              <button type="submit" className={`${item} text-fg-muted`}>
                {labels.signOut}
              </button>
            </form>
          </li>
        </ul>
      </div>
    </details>
  );
}
