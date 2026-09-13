import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getMe } from "@/lib/dal/members";
import { getOrg } from "@/lib/dal/org";

// The platform home. M1's placeholder: a greeting, the org, and the nudge
// REQ-PRF-001 asks for when no company is set. Sessions arrive in M2.
export default async function AppHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [me, org, t] = await Promise.all([getMe(locale), getOrg(locale), getTranslations("app.home")]);

  return (
    <>
      <h1 className="text-h1 text-fg-heading">
        {me.displayName ? t.rich("welcome", { value: me.displayName, name: (chunks) => <bdi>{chunks}</bdi> }) : t("welcomeAnon")}
      </h1>
      <p className="mt-2 text-body text-fg-muted">{t.rich("org", { value: org.name, org: (chunks) => <bdi>{chunks}</bdi> })}</p>
      <p className="mt-6 max-w-prose text-body-lg">{t("intro")}</p>
      {!me.companyId ? (
        <div role="status" className="mt-8 rounded-field border border-edge bg-silver-100 p-5">
          <p className="text-body text-fg-heading">{t("companyMissing")}</p>
          <Link href="/app/me" className="mt-3 inline-flex h-11 items-center rounded-field bg-navy-950 px-5 text-label text-white hover:bg-navy-900">
            {t("completeProfile")}
          </Link>
        </div>
      ) : null}
    </>
  );
}
