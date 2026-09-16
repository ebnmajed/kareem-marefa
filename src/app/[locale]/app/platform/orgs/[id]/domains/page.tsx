import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { InfoIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { formatDate } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { getOrgDetail } from "@/lib/dal/platform";
import { addDomainAction, removeDomainAction, setFirstAdminAction } from "./actions";
import { DomainsTable } from "./domains-table";
import { AddDomainForm, FirstAdminForm } from "./forms";

// SCR-082 · /app/platform/orgs/[id]/domains — REQ-TEN-007, REQ-AUT-003,
// REQ-TEN-002, onto the system for wave 8 (`docs/plan/notes/platform.md` W8.5).
//
// The domain list and the first admin's address are the only two org-owned
// values a super admin may read or write anywhere in this console, and both are
// here because `REQ-ADM-001` names them. «Set the first admin» stays on this
// screen rather than SCR-080's list (DEC-148, C3).
//
// `getOrgDetail` returns null for an unknown id AND for a malformed one, so the
// not-found boundary covers both without a separate branch — a console that
// distinguishes "no such org" from "not a uuid" tells a guesser which guesses
// are closer. Under the loading model that is DEC-134's streamed not-found.

const PLATFORM_TIME_ZONE = "Asia/Riyadh";

export default async function OrgDomainsPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const org = await getOrgDetail(locale, id);
  if (!org) notFound();

  const [t, tOrgs] = await Promise.all([getTranslations("platform.domains"), getTranslations("platform.orgs")]);
  const loc = locale as Locale;

  return (
    <>
      <PageHeader
        title={org.name}
        eyebrow={t("title")}
        breadcrumb={[{ href: "/app/platform/orgs", label: tOrgs("title") }]}
        breadcrumbLabel={t("breadcrumb")}
        meta={
          <>
            <Badge tone="neutral" outline className="font-mono">
              <span dir="ltr">{org.slug}</span>
            </Badge>
            {org.status === "active" ? (
              <Badge tone="success">{tOrgs("statusActive")}</Badge>
            ) : (
              <Badge tone="neutral" outline>
                {tOrgs("statusSuspended")}
              </Badge>
            )}
          </>
        }
      />
      {org.status === "suspended" && org.suspendedAt ? (
        <Panel tone="ended" className="mt-6 max-w-3xl">
          <p className="text-body-sm text-fg-body">
            {t.rich("suspendedSince", {
              date: formatDate(org.suspendedAt, PLATFORM_TIME_ZONE, locale),
              reason: org.suspendedReason ?? "",
              bdi: (c) => <bdi>{c}</bdi>,
            })}
          </p>
        </Panel>
      ) : null}

      <section aria-labelledby="domains" className="mt-10">
        <SectionHeader as="h2" id="domains" title={t("domainsTitle")} description={t("domainsIntro")} count={org.domains.length} />
        {/* Said beside the list, not in a tooltip: an operator who thinks removal
            revokes access has removed the wrong thing (REQ-TEN-007). */}
        <Panel tone="info" className="mt-4 max-w-3xl">
          <p className="flex items-start gap-2 text-body-sm text-fg-body">
            <InfoIcon className="mt-1 text-fg-muted" />
            <span>{t("removalNote")}</span>
          </p>
        </Panel>
        <div className="mt-4 max-w-3xl">
          <DomainsTable domains={org.domains} remove={removeDomainAction.bind(null, loc, org.id)} />
        </div>
        <div className="mt-6">
          <AddDomainForm action={addDomainAction.bind(null, loc, org.id)} />
        </div>
      </section>

      <section aria-labelledby="first-admin" className="mt-12 border-t border-edge pt-8">
        <SectionHeader as="h2" id="first-admin" title={t("firstAdminTitle")} description={t("firstAdminIntro")} />
        <div className="mt-4">
          <FirstAdminForm current={org.firstAdminEmail} action={setFirstAdminAction.bind(null, loc, org.id)} />
        </div>
      </section>
    </>
  );
}
