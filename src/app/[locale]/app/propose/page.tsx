import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { ProposalStatusBadge } from "@/components/sessions/proposal-status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import type { Locale } from "@/i18n/routing";
import { getOrgPrefs, listCategories, listMyProposals, listNameableMembers } from "@/lib/dal/proposals";
import { submitProposal } from "./actions";
import { ProposalForm } from "./proposal-form";

// SCR-017 · /app/propose — propose a topic (REQ-PRO-001, REQ-PRO-002,
// REQ-PRO-003), on the M9 system for wave 7 (DEC-137, DEC-141).
//
// The page is dynamic because the DAL reads cookies — no `export const
// dynamic`, per DEC-013 and the Next 16 notes in CLAUDE.md.
//
// «مقترحاتي» underneath stays, deliberately thin: it is how a named
// co-presenter REACHES their invitation, which REQ-PRO-003 needs. The
// pipeline itself — the state, the reason, the edit — is SCR-018.
//
// ★ The canvas's lead line («ما تكتبه هنا هو ما سيظهر في صفحة الجلسة…») is not
// used: it is untrue until `0084` copies the audience and the duration into
// the session (DEC-075, DEC-141 ruling 9f). The live site's own argument is.

export default async function ProposePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [categories, members, prefs, mine, t] = await Promise.all([
    listCategories(locale),
    listNameableMembers(locale),
    getOrgPrefs(locale),
    listMyProposals(locale),
    getTranslations("proposals.propose"),
  ]);

  const action = submitProposal.bind(null, locale as Locale);

  return (
    <>
      <PageHeader title={t("title")} description={t("lead")} />
      <p className="mt-3 max-w-2xl text-body text-fg-body">{t("leadBody")}</p>

      <ProposalForm
        action={action}
        categories={categories}
        members={members}
        maxCoPresenters={prefs.maxCoPresenters}
        maxCoPresentersLabel={t("form.coPresentersLimit", { count: prefs.maxCoPresenters, value: formatNumber(prefs.maxCoPresenters) })}
      />

      <section aria-labelledby="mine" className="mt-14 flex max-w-2xl flex-col gap-4 border-t border-edge pt-8">
        <SectionHeader id="mine" title={t("mine.title")} count={mine.length > 0 ? mine.length : undefined} />
        {mine.length === 0 ? (
          <EmptyState size="sm" title={t("mine.empty")} action={{ label: t("mine.emptyAction"), href: "#title" }} />
        ) : (
          <ul className="flex flex-col gap-3">
            {mine.map((p) => (
              <li key={p.id}>
                <Card density="row" href={`/app/propose/${p.id}`}>
                  <CardBody>
                    <div className="flex flex-wrap items-center gap-2">
                      <ProposalStatusBadge state={p.state} size="sm" />
                      {p.viewerIsProposer ? null : (
                        <Badge tone="info" outline size="sm">
                          {t("mine.invited")}
                        </Badge>
                      )}
                      {p.viewerInvite === "pending" ? (
                        <Badge tone="live" size="sm">
                          {t("mine.awaitingYou")}
                        </Badge>
                      ) : null}
                    </div>
                    <h3 className="text-h3 text-fg-heading">
                      <bdi>{p.title}</bdi>
                    </h3>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
