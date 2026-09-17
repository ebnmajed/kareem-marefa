import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { LockIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { formatTime } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { getMyActiveImpersonation } from "@/lib/dal/platform";
import { stopImpersonationAction } from "./actions";
import { StopImpersonationControl } from "./stop-control";

// The `ImpersonationBanner` slot — REQ-ADM-002, REQ-ADM-019, SCR-085,
// DEC-052, DEC-055, DEC-147.
//
// ★ IT RENDERS NOTHING FOR ALMOST EVERYONE, ALMOST ALWAYS. `my_impersonation()`
// is keyed on `auth.uid()` and needs no org claim, so this is safe to render on
// every screen for every visitor: a member, a signed-out stranger and a super
// admin with no live session all get null, and only a super admin inside a live
// break-glass session gets a banner. It never redirects and never throws, which
// matters because a slot in a layout takes the whole page down with it.
//
// ★ WHERE IT APPEARS, under DEC-055 option C (still what is built). An
// impersonating super admin has no `member_id`, so an org route sends them to
// `/no-access`; the banner therefore lives in the platform console's shell and
// on `/no-access`, which is everywhere such a session can be.
//
// ★ AN END TIME, NOT A COUNTDOWN (wave 8, notes W8.0 F7). This renders in a
// layout, and a layout is not re-rendered on a client-side navigation: «تنتهي
// خلال 42 دقيقة» was true on the first screen and false on every screen after.
// «تنتهي عند 14:32» stays true — including after the session has ended, until
// the next full request drops the banner.
//
// ★ ONE SURFACE IN TWO CONTEXTS. The console is light and `/no-access` is dark
// (`(auth)/layout.tsx`'s `.theme-dark`). `Panel`'s `live` tone paints a light
// background, and under `.theme-dark` the semantic text tokens turn light — so
// the dark context drops the fill and keeps the live border, the way
// `ui/badge` already treats `live` there. The status itself is the badge: seen
// before it is read (`16` §3 principle 3).
//
// ★ WHAT IT SAYS IS WHAT THE SESSION DOES. Under DEC-055 option C a break-glass
// session opens none of the org's screens, so the banner does not say «you are
// browsing» the org: it names the org the session is open on, says it is in that
// org's own audit log, and says plainly that the org's screens do not open —
// the same sentence `/no-access` says (the lead's copy there, sync 4).
//
// ★ On a phone the stop control sits UNDER the text, full width: beside it, it
// squeezed the sentences into a five-line column at 390 px (sync 4's capture).
// From `sm` up it returns beside the text.
//
// No heading of its own: the host page owns the landmark (TEAM.md §2).

/** The platform's own zone: a super admin has no org to take one from. */
const PLATFORM_TIME_ZONE = "Asia/Riyadh";

export interface ImpersonationBannerProps {
  locale: string;
}

export async function ImpersonationBanner({ locale }: ImpersonationBannerProps) {
  const active = await getMyActiveImpersonation();
  if (!active) return null;

  const t = await getTranslations("platform.banner");

  return (
    // `role="status"` rather than `alert`: a standing condition, not an
    // interruption — an assertive region re-announced on every navigation is
    // how a screen-reader user learns to tune a banner out.
    <div role="status" className="mb-6">
      <Panel tone="live" className="[.theme-dark_&]:border-live-on-dark/50 [.theme-dark_&]:bg-transparent">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 space-y-1.5 sm:flex-1">
            <Badge tone="live" icon={<LockIcon aria-hidden />}>
              {t("badge")}
            </Badge>
            <p className="text-label text-fg-heading">
              {t.rich("viewingAs", { org: active.orgName, bdi: (c) => <bdi>{c}</bdi> })}
            </p>
            <p className="text-body-sm text-fg-body">
              {t.rich("endsAt", {
                time: formatTime(active.expiresAt, PLATFORM_TIME_ZONE, locale),
                bdi: (c) => <bdi>{c}</bdi>,
              })}
            </p>
            <p className="text-body-sm text-fg-muted">{t("readOnly")}</p>
          </div>
          <StopImpersonationControl
            sessionId={active.id}
            stop={stopImpersonationAction.bind(null, locale as Locale)}
            className="w-full sm:w-auto sm:shrink-0"
          />
        </div>
      </Panel>
    </div>
  );
}
