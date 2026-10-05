import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { formatDate } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { getOrgDetail } from "@/lib/dal/platform";
import { addDomainAction, removeDomainAction, setFirstAdminAction } from "./actions";
import { DomainsTable } from "./domains-table";
import { AddDomainForm, FirstAdminForm } from "./forms";

// SCR-082 · /app/platform/orgs/[id]/domains — REQ-TEN-007, REQ-AUT-003, REQ-TEN-002, REQ-UIX-118. Written for wave 26
// from `PlatformDomains.dc.html` (`DEC-208`: deleted first); what it kept is `docs/plan/notes/platform.md` W26.2.3.
//
// The board's `h1` «النطاقات · {org}» with «نطاق جديد», the list of domains with «أزل», and the removal line under it.
// What the board draws and the console does not hold is not built (DEC-251, Q7): no company, no «أُضيف», no members
// per domain — a company is the org's own data, and `platform_org()` returns the domains alone. «تعيين أول مشرف»
// stays on this screen (`DEC-148` C3, `REQ-ADM-001`), below the list.
//
// `getOrgDetail` answers null for an unknown id AND a malformed one, so one not-found covers both (D1, `DEC-134`); it
// is also this page's gate, at the data (F2).

const PLATFORM_TIME_ZONE = "Asia/Riyadh";
/** A page title is plain text: the org's name is isolated with FSI/PDI, the character form of `<bdi>`. */
const isolate = (value: string) => `⁨${value}⁩`;

export default async function OrgDomainsPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const org = await getOrgDetail(locale, id);
  if (!org) notFound();

  const t = await getTranslations("platform.domains");
  const loc = locale as Locale;
  const editable = !org.deletionPending;

  return (
    <>
      <PageHeader
        inlineActions
        title={t("titleFor", { org: isolate(org.name) })}
        actions={
          editable ? (
            <ButtonLink href="#add-domain" size="md">
              {t("newDomain")}
            </ButtonLink>
          ) : undefined
        }
      />

      {org.deletionPending ? (
        // `0097`: on its way out. Nothing here is edited any more (principle 7).
        <Panel tone="error" className="mt-6 max-w-3xl">
          <p className="text-body-sm text-fg-heading">{t("deletionPending")}</p>
        </Panel>
      ) : org.status === "suspended" && org.suspendedAt ? (
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

      <div className="mt-6">
        <DomainsTable domains={org.domains} remove={editable ? removeDomainAction.bind(null, loc, org.id) : undefined} />
        {/* The removal line, beside the list and never in a tooltip: an operator who thinks removal revokes access has
            removed the wrong thing (REQ-TEN-007). */}
        <p className="mt-3 text-body-sm text-fg-muted">{t("removalNote")}</p>
      </div>

      {editable ? (
        <>
          <section id="add-domain" aria-labelledby="add-domain-title" className="mt-10 scroll-mt-20">
            <SectionHeader as="h2" id="add-domain-title" title={t("newDomain")} />
            <div className="mt-4">
              <AddDomainForm action={addDomainAction.bind(null, loc, org.id)} />
            </div>
          </section>

          <section aria-labelledby="first-admin" className="mt-10 border-t border-edge pt-8">
            <SectionHeader as="h2" id="first-admin" title={t("firstAdminTitle")} />
            <div className="mt-4">
              <FirstAdminForm current={org.firstAdminEmail} action={setFirstAdminAction.bind(null, loc, org.id)} />
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
