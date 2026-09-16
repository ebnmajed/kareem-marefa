import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ImpersonationBanner } from "@/components/platform/impersonation-banner";

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
  const t = await getTranslations("auth.noAccess");

  const [title, body] =
    reason === "suspended"
      ? [t("suspended"), t("suspendedBody")]
      : reason === "deactivated"
        ? [t("deactivated"), t("deactivatedBody")]
        : [t("title"), t("noMatch")];
  const wrongAccountLikely = reason !== "suspended" && reason !== "deactivated";

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
