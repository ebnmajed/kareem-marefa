import { getTranslations, setRequestLocale } from "next-intl/server";
import { EarnPanel } from "@/components/proposals/earn-panel";
import { MyProposals } from "@/components/proposals/my-proposals";
import { formatNumber } from "@/components/sessions/numerals";
import { CalendarIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/routing";
import { getOrgPrefs, getProposeEarnings, listCategories, listMyProposals, listNameableMembers } from "@/lib/dal/proposals";
import { submitProposal } from "./actions";
import { ProposalForm } from "./proposal-form";

// SCR-017 · /app/propose — propose a topic. REBUILT from `Propose.dc.html` (REQ-UIX-067, DEC-213, DEC-214), written
// after the old page was deleted (DEC-208); the kept-behaviour table is `docs/plan/notes/sessions.md` W19.2.
//
// The artboard's order: the title row («اقترح موضوعًا» and «مقترحاتي N»), the list of the member's proposals when
// there are any (§5.95), the lead in the display face (§5.105), the body, the no-schedule panel — then the form, which
// carries the progress line, both sections, the earn panel and the sticky bar.
//
// A tab route: the tab bar stays and the bar stands on it (DEC-214 §3); below `lg` the page owns its top row
// (`ownsTopRow()`, the lead's). Every read is the DAL's, through `requireSession()` at the data (REQ-AUT-001) — the
// page checks nothing itself. Dynamic because the DAL reads cookies (DEC-013).
//
// ★ No date, time or venue field exists (REQ-PRO-001) — not hidden, absent — and the page says so out loud.
// ★ Not built (DEC-213): autosave (§5.93), the hosting-gated card (§5.97).

export default async function ProposePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [categories, members, prefs, mine, earnings, t] = await Promise.all([
    listCategories(locale),
    listNameableMembers(locale),
    getOrgPrefs(locale),
    listMyProposals(locale),
    getProposeEarnings(locale),
    getTranslations("proposals.propose"),
  ]);

  // A Server Action bound here, never a closure across the boundary (DEC-159).
  const action = submitProposal.bind(null, locale as Locale);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3 pt-2">
        <h1 className="font-display text-play-md font-extrabold text-fg-heading">{t("title")}</h1>
        {mine.length > 0 ? (
          <a href="#mine" className="shrink-0 text-caption text-fg-muted hover:text-fg-heading">
            {t("mine.link", { value: formatNumber(mine.length) })}
          </a>
        ) : null}
      </div>

      <MyProposals proposals={mine} />

      <div className="flex flex-col gap-1.5">
        <p className="font-display text-play-sm font-extrabold text-accent pg-light:text-fg-heading">{t("lead")}</p>
        <p className="text-body-sm text-fg-muted">{t("leadBody")}</p>
        {/* REQ-PRO-001, said to the member and not only to the schema. */}
        <p className="flex items-center gap-2.5 rounded-panel border border-edge bg-surface px-3 py-2.5 text-body-sm text-fg-muted">
          <CalendarIcon aria-hidden className="shrink-0 text-accent pg-light:text-fg-heading" />
          <span>{t("noScheduleNote")}</span>
        </p>
      </div>

      <ProposalForm
        mode="create"
        action={action}
        categories={categories}
        members={members}
        maxCoPresenters={prefs.maxCoPresenters}
        maxCoPresentersLabel={t("form.coPresentersLimit", { count: prefs.maxCoPresenters, value: formatNumber(prefs.maxCoPresenters) })}
        earn={<EarnPanel earnings={earnings} />}
      />
    </div>
  );
}
