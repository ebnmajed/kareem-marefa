import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { getMyActiveImpersonation, PLATFORM_NUMERALS } from "@/lib/dal/platform";
import { stopImpersonationAction } from "./actions";
import { StopImpersonationControl } from "./stop-control";

// The `ImpersonationBanner` slot — REQ-ADM-002, REQ-ADM-019, SCR-085,
// DEC-052, DEC-055.
//
// ★ IT RENDERS NOTHING FOR ALMOST EVERYONE, ALMOST ALWAYS. `my_impersonation()`
// is keyed on `auth.uid()` and needs no org claim, so this is safe to render on
// every screen for every visitor: a member, a signed-out stranger and a super
// admin with no live session all get null, and only a super admin inside a live
// break-glass session gets a banner. It never redirects and never throws, which
// matters because a slot in a layout takes the whole page down with it.
//
// ★ WHERE IT APPEARS, under DEC-055. This wave accepts that an impersonating
// super admin has no `member_id` and therefore lands on `/no-access` rather
// than inside the org's screens. So the banner belongs in two places — the
// platform console's shell and `/no-access` — and the second is the more
// important of the two: it is the screen the operator is actually looking at,
// and without the banner there it says only «لا يمكن الدخول», which is true and
// useless. Both slots are the lead's to wire.
//
// It says three things and stops: which org, how long is left, and that the
// org's audit log already has the record. The third is not decoration — SCR-085
// states the consequence before the session starts, and a banner that dropped
// it would let an operator forget it the moment the screen changed.
//
// No heading of its own: the host page owns the landmark (TEAM.md §2).

export interface ImpersonationBannerProps {
  locale: string;
}

export async function ImpersonationBanner({ locale }: ImpersonationBannerProps) {
  const active = await getMyActiveImpersonation();
  if (!active) return null;

  const t = await getTranslations("platform.banner");

  return (
    // `role="status"` rather than `alert`: it is a standing condition, not an
    // interruption, and an assertive live region re-announced on every
    // navigation is how a screen-reader user learns to tune a banner out.
    <div
      role="status"
      className="border-b border-edge-strong bg-silver-100 px-4 py-3 md:px-8"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 text-body-sm text-fg-heading">
          {t.rich("viewingAs", { org: active.orgName, bdi: (c) => <bdi>{c}</bdi> })}
        </p>
        <p className="text-body-sm text-fg-body">
          {t("remaining", {
            minutes: t("minutes", {
              count: active.minutesRemaining,
              value: formatNumber(active.minutesRemaining, PLATFORM_NUMERALS),
            }),
          })}
        </p>
        <p className="text-body-sm text-fg-muted">{t("readOnly")}</p>
        <StopImpersonationControl
          sessionId={active.id}
          stop={stopImpersonationAction.bind(null, locale as Locale)}
        />
      </div>
    </div>
  );
}
