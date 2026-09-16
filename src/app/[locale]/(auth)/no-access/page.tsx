import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ImpersonationBanner } from "@/components/platform/impersonation-banner";
import { getSessionState } from "@/lib/dal/session";

// SCR-004 · /no-access — names no org, lists no domain (REQ-AUT-006). Also
// the suspended-org (REQ-TEN-006) and the deactivated-member (REQ-AUT-008)
// messages, chosen by `reason`.
//
// ★ NEVER A DEAD END (REQ-UIX-012, DEC-129). This is the product's only answer
// to «فتحت الرابط ولا شيء يعمل», so every reason names what to do next and
// offers it: a member whose domain matched no org is most often signed in with
// the wrong Google account, so the primary action signs them out and lands
// them on sign-in with another; a suspended org or a deactivated account is an
// administrator's decision, which the message says, and signing out is the
// one act left to offer.
//
// ★ A PLATFORM ADMIN WITH NO ORG lands here too — sign-in has nowhere else to
// send an account that belongs to no organisation — and «الدخول بحساب آخر» was
// the wrong first act: the console was reachable only by typing its URL, and
// during break-glass this page's primary action signed the operator out
// (`platform`'s F6, wave 8, `DEC-148`). For that account the primary action is
// «لوحة المنصة»; signing out stays, secondary. The claim decides only which
// door is offered — the console gates itself at the data.
export default async function NoAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reason?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { reason } = await searchParams;
  const [t, state] = await Promise.all([getTranslations("auth.noAccess"), getSessionState()]);
  const platformAdmin = state.kind === "no_org" && state.platformAdmin && reason !== "suspended" && reason !== "deactivated";

  const [title, body] =
    reason === "suspended"
      ? [t("suspended"), t("suspendedBody")]
      : reason === "deactivated"
        ? [t("deactivated"), t("deactivatedBody")]
        : platformAdmin
          ? [t("platformTitle"), t("platformBody")]
          : [t("title"), t("noMatch")];
  const wrongAccountLikely = !platformAdmin && reason !== "suspended" && reason !== "deactivated";

  return (
    <>
      {/* SCR-085 under DEC-055 option C: a break-glass session carries no
          member id, so this is the screen an impersonating operator lands
          on from any org route. The banner (platform's slot, DEC-057) shows
          the org, the time left and the stop control; it renders nothing
          for everyone else. */}
      <ImpersonationBanner locale={locale} />
      <PageHeader title={title} description={body} />
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {platformAdmin ? (
          <ButtonLink href="/app/platform" variant="primary" size="md" className="w-full sm:w-auto">
            {t("platformConsole")}
          </ButtonLink>
        ) : null}
        {/* Sign-out answers 303 to /ar/sign-in, so «another account» is one act. */}
        <form method="post" action="/api/auth/sign-out">
          <Button type="submit" variant={wrongAccountLikely ? "primary" : "secondary"} size="md" className="w-full sm:w-auto">
            {wrongAccountLikely ? t("switchAccount") : t("signOut")}
          </Button>
        </form>
        <ButtonLink href="/" variant="ghost" size="md">
          {t("backHome")}
        </ButtonLink>
      </div>
    </>
  );
}
