import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HeldAchievements } from "@/components/certificates/held-achievements";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import type { Locale } from "@/i18n/routing";
import { listMembersForAdmin } from "@/lib/dal/admin-members";
import { listHeldAchievements } from "@/lib/dal/certificates";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { getRecognitionAdminData } from "@/lib/dal/scoring-admin";
import { awardBadge, saveBadge, saveLevel, savePerk, saveStreakRule } from "./actions";
import { AwardForm } from "./award-form";
import { BadgeDialog, BadgesTable } from "./badges-table";
import { LevelsTable } from "./levels-table";
import { PerksTable } from "./perks-table";
import { StreaksTable } from "./streaks-table";

// SCR-054 · /app/admin/recognition — REQ-ADM-012, REQ-REC-001 … 008,
// REQ-CRT-012, on the M9 system for wave 8 (K4). Admin only:
// `getRecognitionAdminData()` answers null for anyone else and the page answers
// with the streamed not-found (`DEC-134`).
//
// Automatic evaluation (evaluate_badges / evaluate_streaks /
// evaluate_levels_perks, nightly) reads every table this screen edits — a
// change takes effect on the next run and never rewrites what already happened.
//
// ★ The held achievement certificates come FIRST, and only when there are any:
// they are the one thing on this page waiting for the admin, and the page
// gates their section itself (`16` §5.4.1a(b)) instead of titling an empty
// slot. Everything else is a list with each row edited in its own dialog —
// the page used to be a column of always-open forms, each with a «حفظ».

export default async function RecognitionAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, data, held, members, prefs] = await Promise.all([
    getTranslations("recognition.admin"),
    getRecognitionAdminData(locale),
    listHeldAchievements(locale),
    listMembersForAdmin(locale),
    getOrgPrefs(locale),
  ]);
  if (!data) notFound();
  const bound = locale as Locale;

  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />

      {held.canRelease && held.certificates.length > 0 ? (
        <section aria-labelledby="held-heading" className="mt-10">
          <SectionHeader as="h2" id="held-heading" title={t("held.heading")} description={t("held.intro")} count={held.certificates.length} />
          <div className="mt-4">
            <HeldAchievements certificates={held.certificates} locale={locale} />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="badges-heading" className="mt-10">
        <SectionHeader as="h2" id="badges-heading" title={t("badges.heading")} actions={<BadgeDialog action={saveBadge.bind(null, bound)} />} />
        <div className="mt-4">
          <BadgesTable badges={data.badges} action={saveBadge.bind(null, bound)} locale={bound} />
        </div>
      </section>

      <section aria-labelledby="award-heading" className="mt-12">
        <SectionHeader as="h2" id="award-heading" title={t("award.heading")} description={t("award.intro")} />
        <div className="mt-4">
          <AwardForm
            action={awardBadge.bind(null, bound)}
            members={members ?? []}
            badges={data.badges.filter((b) => b.retiredAt === null).map((b) => ({ id: b.id, name: b.name }))}
            timeZone={prefs.timeZone}
            locale={locale}
          />
        </div>
      </section>

      <section aria-labelledby="levels-heading" className="mt-12">
        <SectionHeader as="h2" id="levels-heading" title={t("levels.heading")} description={t("levels.note")} />
        <div className="mt-4">
          <LevelsTable levels={data.levels} action={saveLevel.bind(null, bound)} />
        </div>
      </section>

      <section aria-labelledby="perks-heading" className="mt-12">
        <SectionHeader as="h2" id="perks-heading" title={t("perks.heading")} />
        <div className="mt-4">
          <PerksTable perks={data.perks} levels={data.levels} badges={data.badges} action={savePerk.bind(null, bound)} />
        </div>
      </section>

      <section aria-labelledby="streaks-heading" className="mt-12">
        <SectionHeader as="h2" id="streaks-heading" title={t("streaks.heading")} />
        <div className="mt-4">
          <StreaksTable rules={data.streakRules} action={saveStreakRule.bind(null, bound)} />
        </div>
      </section>
    </>
  );
}
