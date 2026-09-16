"use client";

import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
import { CalendarIcon } from "@/components/ui/icons";

// «أضِف إلى تقويمك» as ONE button — `16` §5.4.2, REQ-CAL-001, REQ-CAL-002.
//
// After a seat is held the calendar is the event page's one primary action,
// and three provider links side by side are three primaries. So the providers
// sit behind a single `ui/menu`.
//
// ★ Items navigate by `onSelect`, not `href`. `ui/menu`'s `href` items render
// the house `Link` — right for an in-app route, wrong here on both counts:
// Google and Outlook are other sites and open in a new tab (the event page must
// survive the detour), and the ICS is a Route Handler returning a file, which a
// client-side router transition would try to render as a page.

export interface CalendarMenuProps {
  label: string;
  links: { google: string; outlook: string; ics: string };
  labels: { google: string; outlook: string; apple: string };
  /**
   * `card` from `md` up and `bar` below it, when this is the page's ONE primary
   * action; `inline` at every width, when it is a secondary one.
   */
  placement: "card" | "bar" | "inline";
  /** Primary before the session (§5.4.2); secondary while it runs, beside «تسجيل الحضور». */
  variant?: "primary" | "secondary";
}

export function CalendarMenu({ label, links, labels, placement, variant = "primary" }: CalendarMenuProps) {
  const away = (url: string) => () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };
  // The width switch is on a wrapper, never on the button: `hidden` on top of
  // the button's own `inline-flex` would be two display utilities resolved by
  // emit order (DEC-111's class of bug).
  return (
    <div className={placement === "card" ? "hidden md:block" : "min-w-0"}>
      <Menu
        align="start"
        trigger={
          <Button
            variant={variant}
            size={variant === "primary" ? "lg" : "md"}
            className="w-full"
            iconStart={<CalendarIcon className="text-[1.125rem]" />}
          >
            {label}
          </Button>
        }
        items={[
          { label: labels.google, onSelect: away(links.google) },
          { label: labels.outlook, onSelect: away(links.outlook) },
          {
            label: labels.apple,
            onSelect: () => {
              window.location.assign(links.ics);
            },
          },
        ]}
      />
    </div>
  );
}
