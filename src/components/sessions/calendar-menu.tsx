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
   * ★ ONE GROUP PER DAY (`notify`'s request, `notify.md` §W11.2; `REQ-SES-015`,
   * `REQ-CAL-001`). A member adding a three-evening workshop wants three
   * entries, and Google and Outlook take one date each.
   *
   * ★ RENDERED FLAT UNLESS THERE ARE AT LEAST TWO, so a one-day menu keeps
   * today's DOM exactly — three items, no rule, no prefix — whether the caller
   * passes nothing, or one group. Two readings of «one day» cannot then differ.
   *
   * `label` is the day's, from `dayShortLabel()`: this component never names a
   * day itself, because contract 7 says one formatter does.
   */
  groups?: { label: string; links: { google: string; outlook: string } }[];
  /**
   * `card` from `md` up and `bar` below it, when this is the page's ONE primary
   * action; `inline` at every width, when it is a secondary one.
   */
  placement: "card" | "bar" | "inline";
  /** Primary before the session (§5.4.2); secondary while it runs, beside «تسجيل الحضور». */
  variant?: "primary" | "secondary";
}

export function CalendarMenu({ label, links, labels, groups, placement, variant = "primary" }: CalendarMenuProps) {
  const away = (url: string) => () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // ★ The day rides in the ITEM'S OWN LABEL — «اليوم الثاني · تقويم Google» —
  // because `ui/menu` has no group heading: `MenuItem.startsGroup` draws a rule
  // and nothing else. A heading would be a change to `console`'s primitive for
  // a menu that is at most seven items long, and an item a screen reader reads
  // as one phrase is better than a heading it may skip past anyway.
  const perDay =
    groups && groups.length > 1
      ? groups.flatMap((group, index) => [
          { label: `${group.label} · ${labels.google}`, onSelect: away(group.links.google), startsGroup: index > 0 },
          { label: `${group.label} · ${labels.outlook}`, onSelect: away(group.links.outlook) },
        ])
      : [
          { label: labels.google, onSelect: away(links.google) },
          { label: labels.outlook, onSelect: away(links.outlook) },
        ];
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
          ...perDay,
          {
            // ★ ONE ICS ITEM AT EVERY NUMBER OF DAYS. The file already carries a
            // `VEVENT` per day (`notify`, contract 8), so splitting it per day
            // would hand a member three downloads of overlapping calendars.
            // Its rule separates it from the last day's pair.
            label: labels.apple,
            startsGroup: Boolean(groups && groups.length > 1),
            onSelect: () => {
              window.location.assign(links.ics);
            },
          },
        ]}
      />
    </div>
  );
}
