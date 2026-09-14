import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getOrgPrefs, listCategories, listMyProposals, listNameableMembers } from "@/lib/dal/proposals";
import { submitProposal } from "./actions";
import { ProposalForm } from "./proposal-form";

// SCR-017 · /app/propose — propose a topic (REQ-PRO-001, REQ-PRO-002,
// REQ-PRO-003).
//
// The page is dynamic because the DAL reads cookies — no `export const
// dynamic`, per DEC-013 and the Next 16 notes in CLAUDE.md.
//
// The list underneath is deliberately thin: it exists so a named co-presenter
// can REACH their invitation, which REQ-PRO-003 needs. The pipeline itself,
// with its reasons and its history, is SCR-018 and REQ-PRO-008.

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
  const ts = await getTranslations("proposals.proposal");

  const action = submitProposal.bind(null, locale as Locale);

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-body-lg text-fg-heading">{t("lead")}</p>
      <p className="mt-2 max-w-2xl text-body text-fg-muted">{t("leadBody")}</p>
      {/* REQ-PRO-001, said to the member and not only to the schema. */}
      <p className="mt-4 max-w-2xl rounded-field border border-edge bg-silver-100 p-4 text-body-sm text-fg-body">{t("noScheduleNote")}</p>

      <ProposalForm
        action={action}
        categories={categories}
        members={members}
        maxCoPresenters={prefs.maxCoPresenters}
        maxCoPresentersLabel={t("form.coPresentersLimit", { count: prefs.maxCoPresenters, value: formatNumber(prefs.maxCoPresenters, prefs.numerals) })}
      />

      <section aria-labelledby="mine" className="mt-14 max-w-2xl border-t border-edge pt-8">
        <h2 id="mine" className="text-h2 text-fg-heading">
          {t("mine.title")}
        </h2>
        {mine.length === 0 ? (
          <p className="mt-3 text-body text-fg-muted">{t("mine.empty")}</p>
        ) : (
          <>
            <p className="mt-2 text-body-sm text-fg-muted">{t("mine.count", { count: mine.length, value: formatNumber(mine.length, prefs.numerals) })}</p>
            <ul className="mt-4 space-y-3">
              {mine.map((p) => (
                <li key={p.id} className="rounded-field border border-edge p-4">
                  <Link href={`/app/propose/${p.id}`} className="text-label text-fg-heading underline underline-offset-4">
                    <bdi>{p.title}</bdi>
                  </Link>
                  <p className="mt-1 text-body-sm text-fg-muted">
                    {ts(`state.${p.state}`)}
                    {p.viewerIsProposer ? "" : ` · ${t("mine.invited")}`}
                    {p.viewerInvite === "pending" ? ` · ${t("mine.awaitingYou")}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
