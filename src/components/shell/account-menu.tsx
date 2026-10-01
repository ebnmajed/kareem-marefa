"use client";

import { useId } from "react";
import type { MenuItem } from "@/components/ui";
import { Avatar } from "@/components/ui/avatar";
import { ChevronIcon, UserIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";

// The account menu — `16` §6.1 note 3, DEC-072, DEC-111, REQ-UIX-002, REQ-UIX-023.
//
// ★★ IT WAS A `<details>`, AND THAT WAS THE OWNER'S STUCK DROPDOWN. A native
// disclosure has no reason to close when a link inside it is followed, and
// under Partial Rendering the layout that holds it never re-renders on
// navigation — so the panel stayed open, hanging over the page it had just
// navigated to. It also ignored an outside click and `Escape`, and two could be
// open at once. The earlier comment here defended `<details>` as "no
// JavaScript, keyboard-native"; it was right about what that buys and silent
// about what it cost. `ui/menu` is Radix, and Radix owns exactly the four
// behaviours the native element lacked: close on select, on outside click, on
// `Escape` (returning focus to the trigger), and one menu open at a time.
//
// ★ Sign-out is a POST, and a menu item is not a form. The form lives OUTSIDE
// the menu's portal and the item submits it — so the menu closes as it would
// for any item, and signing out stays a real form submission.
//
// Staff links stop being a font colour: a rule, then the console links, so a
// moderator looking for their queue has somewhere to look.

export interface AccountMenuProps {
  memberId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** The member's company colour, for the ring (REQ-UIX-043). `undefined` draws none. */
  teamColor?: string | null;
  isStaff: boolean;
  isPlatformAdmin: boolean;
  labels: {
    account: string;
    profile: string;
    points: string;
    certificates: string;
    bookmarks: string;
    calendar: string;
    notifications: string;
    privacy: string;
    members: string;
    admin: string;
    platform: string;
    signOut: string;
  };
}

export function AccountMenu({ memberId, displayName, avatarUrl, teamColor, isStaff, isPlatformAdmin, labels }: AccountMenuProps) {
  // The first name beside the avatar, from `lg` (`HomeDesktop.dc.html`). It is decoration for
  // the eye: the control's name is «حسابي» at every width.
  const firstName = displayName?.trim().split(/\s+/)[0] ?? null;
  const signOutFormId = useId();

  // The seven `/app/me` routes, in the hub's own tab order (`me/layout.tsx`).
  // «حجوزاتي» went with wave 7: it pointed at `/app/me` beside «ملفي», a second
  // link to the same page, while notifications and privacy had none.
  const items: MenuItem[] = memberId
    ? [
        { label: labels.profile, href: "/app/me" },
        { label: labels.points, href: "/app/me/points" },
        { label: labels.certificates, href: "/app/me/certificates" },
        { label: labels.bookmarks, href: "/app/me/bookmarks" },
        { label: labels.calendar, href: "/app/me/calendar" },
        { label: labels.notifications, href: "/app/me/notifications" },
        { label: labels.privacy, href: "/app/me/privacy" },
        // ★ wave 19 (DEC-213 §3.4): the phone's way to the directory — no sixth tab.
        { label: labels.members, href: "/app/members", startsGroup: true },
      ]
    : [];
  const staff: MenuItem[] = [
    ...(isStaff ? [{ label: labels.admin, href: "/app/admin" }] : []),
    ...(isPlatformAdmin ? [{ label: labels.platform, href: "/app/platform" }] : []),
  ];
  if (staff.length) items.push({ ...staff[0], startsGroup: items.length > 0 }, ...staff.slice(1));
  items.push({ label: labels.signOut, onSelect: () => (document.getElementById(signOutFormId) as HTMLFormElement | null)?.requestSubmit(), startsGroup: items.length > 0 });

  return (
    <>
      <Menu
        align="end"
        trigger={
          <button
            type="button"
            aria-label={labels.account}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-edge bg-surface p-1 text-fg-heading hover:bg-hover lg:pe-3 focus-visible:outline-[length:var(--focus-width)] focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            {/* An account with no member row — a platform admin with no org — has no
                avatar to draw; the person glyph keeps the control recognisable. */}
            {memberId ? (
              <Avatar memberId={memberId} displayName={displayName} src={avatarUrl} size={34} teamColor={teamColor} decorative />
            ) : (
              <span aria-hidden className="inline-flex size-[34px] items-center justify-center rounded-full bg-raised text-fg-muted">
                <UserIcon />
              </span>
            )}
            {firstName ? (
              <span aria-hidden className="hidden text-[0.8125rem] font-bold lg:inline">
                <bdi>{firstName}</bdi>
              </span>
            ) : null}
            <ChevronIcon direction="down" className="hidden text-fg-muted lg:inline" />
          </button>
        }
        items={items}
      />
      <form id={signOutFormId} method="post" action="/api/auth/sign-out" hidden />
    </>
  );
}
