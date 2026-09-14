import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getRecognitionAdminData } from "@/lib/dal/scoring-admin";
import { HeldAchievements } from "@/components/certificates/held-achievements";
import { saveBadge, saveLevel, saveManualBadgeAward, savePerk, saveStreakRule } from "./actions";

// SCR-054 · /app/admin/recognition — DEC-046's wave-2 carve-out for
// `scoring`; `console` inherits this path at wave 3.
//
// Automatic evaluation (evaluate_badges/evaluate_streaks/evaluate_levels_perks,
// nightly) reads every table this screen edits, live — a change here takes
// effect on the next run, never rewriting what already happened.

const field = "mt-1 block h-11 w-full rounded-field border border-edge-strong bg-canvas px-3 text-body text-fg-heading";

export default async function RecognitionAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { saved, error } = await searchParams;

  const [t, data] = await Promise.all([getTranslations("recognition.admin"), getRecognitionAdminData(locale)]);
  if (!data) notFound();

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-2 text-body text-fg-muted">{t("intro")}</p>

      {saved ? (
        <p role="status" className="mt-4 rounded-field border border-edge bg-silver-100 p-3 text-body text-fg-heading">
          {t("saved")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-field border border-edge-strong p-3 text-body text-fg-heading">
          {t("error")}
        </p>
      ) : null}

      <section aria-labelledby="badges-heading" className="mt-10">
        <h2 id="badges-heading" className="text-h2 text-fg-heading">
          {t("badges.heading")}
        </h2>
        <ul className="mt-4 space-y-4">
          {data.badges.map((badge) => (
            <li key={badge.id} className="rounded-field border border-edge p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-label text-fg-heading">
                  <bdi>{badge.name}</bdi> <span className="text-body-sm text-fg-muted">({badge.key})</span>
                </p>
                {badge.isManual ? <span className="text-body-sm text-fg-muted">{t("badges.manualOnly")}</span> : null}
                {badge.retiredAt ? <span className="text-body-sm text-fg-muted">{t("badges.retired")}</span> : null}
              </div>
              <form action={saveBadge} className="mt-3 space-y-3">
                <input type="hidden" name="badgeId" value={badge.id} />
                <label className="block">
                  <span className="text-body-sm text-fg-muted">{t("badges.description")}</span>
                  <textarea name="description" defaultValue={badge.description ?? ""} rows={2} className={field} style={{ height: "auto" }} />
                </label>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input name="issuesCertificate" type="checkbox" defaultChecked={badge.issuesCertificate} className="size-5" />
                    <span className="text-body-sm text-fg-heading">{t("badges.certificate")}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input name="retired" type="checkbox" defaultChecked={Boolean(badge.retiredAt)} className="size-5" />
                    <span className="text-body-sm text-fg-heading">{badge.retiredAt ? t("badges.restore") : t("badges.retire")}</span>
                  </label>
                  <button type="submit" className="h-10 rounded-field bg-navy-950 px-4 text-label text-white hover:bg-navy-900">
                    {t("badges.save")}
                  </button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="manual-award-heading" className="mt-12 max-w-xl">
        <h2 id="manual-award-heading" className="text-h2 text-fg-heading">
          {t("manualAward.heading")}
        </h2>
        <p className="mt-2 text-body text-fg-muted">{t("manualAward.intro")}</p>
        <form action={saveManualBadgeAward} className="mt-4 space-y-4">
          <label className="block">
            <span className="text-label text-fg-heading">{t("manualAward.member")}</span>
            <input name="memberId" required dir="ltr" className={`${field} text-start`} />
          </label>
          <label className="block">
            <span className="text-label text-fg-heading">{t("manualAward.badge")}</span>
            <select name="badgeId" required className={field}>
              {data.badges
                .filter((b) => !b.retiredAt)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="text-label text-fg-heading">{t("manualAward.reason")}</span>
            <textarea name="reason" required rows={2} className={field} style={{ height: "auto" }} />
          </label>
          <button type="submit" className="h-11 rounded-field bg-navy-950 px-5 text-label text-white hover:bg-navy-900">
            {t("manualAward.submit")}
          </button>
        </form>
      </section>

      <section aria-labelledby="levels-heading" className="mt-12">
        <h2 id="levels-heading" className="text-h2 text-fg-heading">
          {t("levels.heading")}
        </h2>
        <p className="mt-2 text-body-sm text-fg-muted">{t("levels.note")}</p>
        <ul className="mt-4 space-y-3">
          {data.levels.map((level) => (
            <li key={level.id} className="flex flex-wrap items-center gap-4 rounded-field border border-edge p-3">
              <p className="text-body text-fg-heading">
                <bdi>{level.name}</bdi>
              </p>
              <form action={saveLevel} className="flex items-center gap-3">
                <input type="hidden" name="levelId" value={level.id} />
                <label className="flex items-center gap-2">
                  <span className="text-body-sm text-fg-muted">{t("levels.threshold")}</span>
                  <input name="thresholdPoints" type="number" min={0} defaultValue={level.thresholdPoints} className={field} style={{ maxWidth: "8rem" }} />
                </label>
                <button type="submit" className="h-10 rounded-field bg-navy-950 px-4 text-label text-white hover:bg-navy-900">
                  {t("levels.save")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="perks-heading" className="mt-12">
        <h2 id="perks-heading" className="text-h2 text-fg-heading">
          {t("perks.heading")}
        </h2>
        <ul className="mt-4 space-y-3">
          {data.perks.map((perk) => (
            <li key={perk.id} className="rounded-field border border-edge p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-body text-fg-heading">{t(`perks.${perk.key}`)}</p>
                <form action={savePerk} className="flex items-center gap-3">
                  <input type="hidden" name="perkId" value={perk.id} />
                  <label className="flex items-center gap-2">
                    <input name="enabled" type="checkbox" defaultChecked={perk.enabled} className="size-5" />
                    <span className="text-body-sm text-fg-heading">{t("perks.enabled")}</span>
                  </label>
                  <button type="submit" className="h-10 rounded-field bg-navy-950 px-4 text-label text-white hover:bg-navy-900">
                    {t("perks.save")}
                  </button>
                </form>
              </div>
              {perk.requiredLevelName ? (
                <p className="mt-1 text-body-sm text-fg-muted">
                  {t("perks.requiredLevel")}: <bdi>{perk.requiredLevelName}</bdi>
                </p>
              ) : null}
              {perk.requiredBadgeName ? (
                <p className="mt-1 text-body-sm text-fg-muted">
                  {t("perks.requiredBadge")}: <bdi>{perk.requiredBadgeName}</bdi>
                </p>
              ) : null}
              {perk.key === "can_host" ? <p className="mt-2 text-body-sm text-fg-muted">{t("perks.canHostWarning")}</p> : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="streaks-heading" className="mt-12">
        <h2 id="streaks-heading" className="text-h2 text-fg-heading">
          {t("streaks.heading")}
        </h2>
        <ul className="mt-4 space-y-3">
          {data.streakRules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-end gap-4 rounded-field border border-edge p-3">
              <form action={saveStreakRule} className="flex flex-wrap items-end gap-4">
                <input type="hidden" name="streakRuleId" value={rule.id} />
                <label className="flex flex-col gap-1">
                  <span className="text-body-sm text-fg-muted">{t("streaks.requiredCount")}</span>
                  <input name="requiredCount" type="number" min={1} defaultValue={rule.requiredCount} className={field} style={{ maxWidth: "8rem" }} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-body-sm text-fg-muted">{t("streaks.bonusPoints")}</span>
                  <input name="bonusPoints" type="number" min={0} defaultValue={rule.bonusPoints} className={field} style={{ maxWidth: "8rem" }} />
                </label>
                <label className="flex items-center gap-2 pb-2">
                  <input name="enabled" type="checkbox" defaultChecked={rule.enabled} className="size-5" />
                  <span className="text-body-sm text-fg-heading">{t("streaks.enabled")}</span>
                </label>
                <button type="submit" className="h-10 rounded-field bg-navy-950 px-4 text-label text-white hover:bg-navy-900">
                  {t("streaks.save")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      {/* الشهادات المحجوزة — the designer slot on SCR-054 (REQ-CRT-012): a
          leaderboard certificate is held until an admin releases it, and an
          achievement certificate has no session for SCR-045 to release it
          from, so the release lives here. The page owns the landmark and the
          heading; the slot owns its data and its action (TEAM.md §2). */}
      <section aria-labelledby="held-certificates-heading" className="mt-12">
        <h2 id="held-certificates-heading" className="text-h2 text-fg-heading">
          {t("heldCertificates")}
        </h2>
        <HeldAchievements locale={locale} />
      </section>
    </>
  );
}
