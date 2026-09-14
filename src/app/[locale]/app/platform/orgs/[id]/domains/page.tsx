import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatNumber } from "@/components/sessions/numerals";
import { getOrgDetail, PLATFORM_NUMERALS } from "@/lib/dal/platform";
import { addDomainAction, removeDomainAction, setFirstAdminAction } from "./actions";
import { AddDomainForm, FirstAdminForm } from "./forms";

// SCR-082 · /app/platform/orgs/[id]/domains — REQ-TEN-007, REQ-AUT-003,
// REQ-TEN-002.
//
// The domain list and the first admin's address are the only two org-owned
// values a super admin may read or write anywhere in this console, and both
// are here because `REQ-ADM-001` names them. Everything else about the org on
// this page is a count.
//
// `getOrgDetail` returns null for an unknown id AND for a malformed one, so
// the not-found boundary covers both without a separate branch — a console
// that distinguishes "no such org" from "not a uuid" tells a guesser which
// guesses are closer.
export default async function OrgDomainsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const org = await getOrgDetail(locale, id);
  if (!org) notFound();

  const t = await getTranslations("platform.domains");

  return (
    <>
      <p>
        <Link href="/app/platform/orgs" className="text-body-sm text-fg-muted underline underline-offset-4 hover:text-fg-heading">
          {t("backToOrgs")}
        </Link>
      </p>

      <h1 className="mt-4 text-h1 text-fg-heading">
        <bdi>{org.name}</bdi>
      </h1>
      <p className="mt-2 text-body-sm text-fg-muted">
        <bdi dir="ltr">{org.slug}</bdi>
      </p>

      <section aria-labelledby="domains" className="mt-10">
        <h2 id="domains" className="text-h2 text-fg-heading">
          {t("domainsTitle")}
        </h2>
        <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("domainsIntro")}</p>
        {/* Said beside the control, not in a tooltip: an operator who thinks
            removal revokes access has removed the wrong thing (REQ-TEN-007). */}
        <p className="mt-2 max-w-2xl text-body-sm text-fg-muted">{t("removalNote")}</p>

        <p className="mt-6 text-body-sm text-fg-muted">{t("domainCount", { count: org.domains.length, value: formatNumber(org.domains.length, PLATFORM_NUMERALS) })}</p>

        {org.domains.length === 0 ? (
          <p className="mt-3 text-body text-fg-body">{t("empty")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {org.domains.map((domain) => (
              <li key={domain} className="flex flex-wrap items-center justify-between gap-3 rounded-field border border-edge px-4 py-3">
                <span className="font-mono text-body text-fg-heading">
                  <bdi dir="ltr">{domain}</bdi>
                </span>
                <form action={removeDomainAction.bind(null, locale as Locale, org.id, domain)}>
                  <button type="submit" className="text-label text-fg-muted underline underline-offset-4 hover:text-fg-heading">
                    {t("remove")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <AddDomainForm action={addDomainAction.bind(null, locale as Locale, org.id)} />
      </section>

      <section aria-labelledby="first-admin-heading" className="mt-12 border-t border-edge pt-8">
        <h2 id="first-admin-heading" className="text-h2 text-fg-heading">
          {t("firstAdminTitle")}
        </h2>
        <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("firstAdminIntro")}</p>
        <FirstAdminForm current={org.firstAdminEmail} action={setFirstAdminAction.bind(null, locale as Locale, org.id)} />
      </section>
    </>
  );
}
