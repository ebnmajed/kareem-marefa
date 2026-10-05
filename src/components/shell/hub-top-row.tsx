import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { ChevronIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";

// A hub page's own top row — `Points.dc.html:14-17`, `Me.dc.html`, `Settings.dc.html`; `REQ-UIX-070`, contract 1
// as `DEC-217` and the lead's note amend it.
//
// On the phone the page owns its first row (`ownsTopRow`): on a sub-page a back control to `/app/me`, then the
// page's `h1` in the display face, and at the inline-end an optional action (the settings link on `/app/me`). From
// `lg` the shell's bar and rail stand, so the back control goes and the `h1` sits under the desktop strip — which is
// where `HubDesktop.dc.html` draws the page's title.
//
// The lead's. A page passes its own title, already translated; nothing here reads a page's namespace.
//
// ★ wave 26 (`DEC-251` §3.5, `DEC-NEXT-39`): `backHref`, add-only. `/app/me/privacy` is a hub page reached from
// settings, so its back control returns there (`Privacy.dc.html:20`); every other page keeps `/app/me`.
export async function HubTopRow({
  title,
  back = true,
  backHref = "/app/me",
  backLabel,
  action,
}: {
  title: string;
  back?: boolean;
  backHref?: string;
  /** The back control's accessible name when it does not lead to the hub. */
  backLabel?: string;
  action?: ReactNode;
}) {
  const t = await getTranslations("app.shell");
  return (
    <div className="flex items-center gap-2.5">
      {back ? (
        <Link
          href={backHref}
          aria-label={backLabel ?? t("account")}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill border border-edge bg-surface text-fg-heading lg:hidden"
        >
          <ChevronIcon direction="back" />
        </Link>
      ) : null}
      <h1 className="min-w-0 flex-1 font-display text-[1.75rem] leading-[1.4] font-extrabold text-fg-heading">{title}</h1>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
