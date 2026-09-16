"use client";

import { useId } from "react";
import type { MenuItem } from "@/components/ui";
import { Avatar } from "@/components/ui/avatar";
import { ChevronIcon } from "@/components/ui/icons";
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
    admin: string;
    platform: string;
    signOut: string;
  };
}

export function AccountMenu({ memberId, displayName, avatarUrl, isStaff, isPlatformAdmin, labels }: AccountMenuProps) {
  const signOutFormId = useId();

  const items: MenuItem[] = memberId
    ? [
        { label: labels.profile, href: "/app/me" },
        { label: labels.rsvps, href: "/app/me" },
        { label: labels.points, href: "/app/me/points" },
        { label: labels.certificates, href: "/app/me/certificates" },
        { label: labels.bookmarks, href: "/app/me/bookmarks" },
        { label: labels.calendar, href: "/app/me/calendar" },
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
            className="inline-flex h-11 items-center gap-1.5 rounded-field px-2 text-fg-heading hover:bg-silver-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            {memberId ? <Avatar memberId={memberId} displayName={displayName} src={avatarUrl} size={34} decorative /> : null}
            <ChevronIcon direction="down" className="text-fg-muted" />
          </button>
        }
        items={items}
      />
      <form id={signOutFormId} method="post" action="/api/auth/sign-out" hidden />
    </>
  );
}
