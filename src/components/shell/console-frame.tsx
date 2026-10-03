"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { AdminRailLink } from "@/components/ui";
import { AdminRail } from "@/components/ui/admin-rail";
import { IconButton } from "@/components/ui/icon-button";
import { MenuIcon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";

// The org console's frame — REQ-UIX-084, DEC-225 §3 (`DEC-NEXT-26`), DEC-226, DEC-227. The lead's.
//
// From `AdminDashboard.dc.html` and `AdminSessionsPhone.dc.html`: a 52 px bar at every width, the 220 px rail at the
// inline-start from `lg`, sticky under the bar, and the page beside it at 24 px padding. Below `lg` the rail is a
// `sheet` behind ≡ that keeps the six ruled groups (`DEC-226` §1) and closes on navigation.
//
// A client component only for the sheet's open state. What it draws arrives from the server layout: plain data for
// the rail (no function crosses — the old rail's crash), and server-rendered nodes for the bar.
//
// ★ `data-console` is what `globals.css` keys on: the bar's height into `--header-h` and `--console-bar`, and motion
// off for everything beneath it (`REQ-UIX-053`, `DEC-228` §6) — so a shared primitive cannot bring a transition in.
// Only one rail is focusable at a width: the aside is `display: none` below `lg`, the sheet mounts only when open.
//
// ★★ THE STUDIO FRAME (wave 23, REQ-UIX-107, DEC-237 contract 1). The two editors own the whole viewport and draw their
// own bar (`AdminDesigner.dc.html`, `AdminEmails.dc.html`): on their routes this renders BARE — no console bar, no rail,
// no sheet — and keeps `data-console`, so motion stays off and the display face stays the `h1`'s. Decided here from
// `usePathname()`, which the server render knows too, so there is no flash; the layout is not re-rendered on a
// client-side navigation and could not decide it (wave 7). No URL moved. The layout still never gates.

export interface ConsoleFrameProps {
  groups: AdminRailLink[][];
  /** The nav landmark's name, and the sheet's. */
  railLabel: string;
  openLabel: string;
  skipLabel: string;
  /** The wordmark, linked — drawn from `lg`. */
  brand: ReactNode;
  title: string;
  orgName: string | null;
  /** «التطبيق». */
  toApp: ReactNode;
  /** The account menu — drawn from `lg`, as the artboards draw it. */
  account: ReactNode;
  children: ReactNode;
}

const strip = (path: string) => path.replace(/^\/(ar|en)(?=\/|$)/, "");

/** The editors' routes — they draw their own bar: the designer, and one email's builder (`notify`'s plan, sync 1). The
 *  email gallery `/app/admin/emails` itself stays framed. */
export function isStudioEditor(pathname: string): boolean {
  const path = strip(pathname);
  return path.startsWith("/app/admin/designer/") || /^\/app\/admin\/emails\/[^/]+$/.test(path);
}

export function ConsoleFrame({ groups, railLabel, openLabel, skipLabel, brand, title, orgName, toApp, account, children }: ConsoleFrameProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "";
  const hasRail = groups.some((group) => group.length > 0);

  if (isStudioEditor(pathname)) {
    return (
      <div data-console="" data-studio="" className="h-dvh overflow-hidden bg-canvas">
        <div id="admin-content" tabIndex={-1} className="h-full min-w-0 outline-none">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div data-console="" className="min-h-dvh bg-canvas">
      {/* ★ REQ-UIX-017 — a second skip link, past the rail. `tabIndex={-1}` on the target so focus really moves. */}
      {hasRail ? (
        <a href="#admin-content" className="skip-link rounded-field bg-accent px-4 py-2 text-label text-on-accent">
          {skipLabel}
        </a>
      ) : null}

      <header data-console-bar="" className="sticky top-0 z-30 h-[var(--console-bar)] border-b border-edge bg-canvas">
        <div className="flex h-full items-center gap-3 px-4 lg:gap-4 lg:px-6">
          {hasRail ? (
            <IconButton label={openLabel} size="sm" className="lg:hidden" onClick={() => setOpen(true)}>
              <MenuIcon />
            </IconButton>
          ) : null}
          <span className="hidden lg:inline-flex">{brand}</span>
          <p className="text-label font-bold text-fg-heading">{title}</p>
          {orgName ? (
            <p className="hidden text-caption text-fg-muted lg:block">
              <bdi>{orgName}</bdi>
            </p>
          ) : null}
          <span aria-hidden className="flex-1" />
          {toApp}
          <div className="hidden lg:block">{account}</div>
        </div>
      </header>

      {hasRail ? (
        <div className="lg:grid lg:grid-cols-[13.75rem_minmax(0,1fr)]">
          <aside className="hidden border-e border-edge p-2 lg:sticky lg:top-[var(--console-bar)] lg:block lg:h-[calc(100dvh-var(--console-bar))] lg:overflow-y-auto">
            <AdminRail groups={groups} label={railLabel} />
          </aside>
          <div id="admin-content" tabIndex={-1} className="min-w-0 px-4 py-4 outline-none lg:p-6">
            {children}
          </div>
        </div>
      ) : (
        <div id="admin-content" tabIndex={-1} className="min-w-0 px-4 py-4 outline-none lg:p-6">
          {children}
        </div>
      )}

      {hasRail ? (
        <Sheet open={open} onOpenChange={setOpen} title={railLabel} side="inline-start">
          <AdminRail groups={groups} label={railLabel} onNavigate={() => setOpen(false)} />
        </Sheet>
      ) : null}
    </div>
  );
}
