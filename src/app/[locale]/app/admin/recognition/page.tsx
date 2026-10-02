import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EditorSurface } from "@/components/admin/editor-surface";
import { HeldAchievements } from "@/components/certificates/held-achievements";
import { formatDateTime } from "@/components/sessions/numerals";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import type { Locale } from "@/i18n/routing";
import { listMembersForAdmin } from "@/lib/dal/admin-members";
import { listHeldAchievements } from "@/lib/dal/certificates";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { getConfigLastSave, getRecognitionAdminData, listAvatarHrefs } from "@/lib/dal/scoring-admin";
import { awardBadge, releaseHeldCertificate, revokeHeldCertificate, saveBadgeSheet, saveRecognitionEdit } from "./actions";
import { AwardForm } from "./award-sheet";
import { BadgeSheet } from "./badge-sheet";
import { RecognitionEdit } from "./recognition-edit";
import { BadgesTable, LevelsTable, PerksTable, StreaksTable } from "./recognition-tables";
import { RevokeSheet } from "./revoke-sheet";
import type { RecognitionOpened } from "./state";

// SCR-054 · /app/admin/recognition — written from `AdminRecognition.dc.html` (`REQ-UIX-101`, `STORY-UIX-091`) after the
// old page was deleted (`DEC-208`); the kept-behaviour table is `notes/scoring.md`'s «054», fourteen rows.
//
// ★ READ BY DEFAULT (REQ-UIX-091): the h1 row with «عدّل» — and the two undrawn actions `DEC-232` §5.2 keeps, «شارة
// جديدة» and «امنح شارة» (REQ-REC-001) — the saved mark from the history rows the last save wrote, then the artboard's
// two tables side by side: levels (its colour the read-only ramp stop) and badges (how many hold each). Below them the
// two the artboard does not draw and REQ-ADM-012 keeps, perks and the monthly streak — whose payout is SCR-053's
// «سلسلة الحضور الشهرية»; `bonus_points` is read by nothing and not shown (DEC-232 §4 row 2). Then the held achievement
// certificates, with «أصدر» and «أوقف» on the row — only when there are any; the page gates the section.
// ★ Every write is one `save_recognition()` call (edit mode, or a badge's sheet), `award_badge_manually()`,
// `release_certificates()` or `revoke_certificate()` — each recorded: history (`levels`, `badges`, `perks`, `streaks`),
// `badge.manual_award`, `certificate.released`, `certificate.revoked` (DEC-231 §4, DEC-232 §2.3).
// ★ No badge revoke (DEC-231 §6.4): retiring stops future awards and never takes a held badge. No level certificates.
// ★ The URL is the state — `?edit`, `?badge=new|<id>`, `?award=1`, `?revoke=<id>` — so every form works without JS.
//
// Admin only: `getRecognitionAdminData()` answers null for anyone else, and the page answers with the streamed
// not-found (`DEC-134`); a moderator never reaches it (`REQ-ADM-020`).

const PATH = "/app/admin/recognition";
const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;

export default async function RecognitionAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ edit?: string; badge?: string; award?: string; revoke?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, data, sp] = await Promise.all([getTranslations("recognition.admin"), getRecognitionAdminData(locale), searchParams]);
  if (!data) notFound();
  const bound = locale as Locale;
  const editing = sp.edit !== undefined;
  const awarding = !editing && sp.award === "1";

  const [held, members, prefs, mark] = await Promise.all([
    listHeldAchievements(locale),
    awarding ? listMembersForAdmin(locale) : Promise.resolve(null),
    getOrgPrefs(locale),
    getConfigLastSave(locale, ["levels", "badges", "perks", "streaks"]),
  ]);

  if (editing) {
    const opened: RecognitionOpened = {
      levels: data.levels.map((l) => ({ id: l.id, name: l.name, thresholdPoints: l.thresholdPoints, updatedAt: l.updatedAt })),
      badges: data.badges.map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        issuesCertificate: b.issuesCertificate,
        rule: b.rule,
        retired: b.retiredAt !== null,
        updatedAt: b.updatedAt,
      })),
      perks: data.perks.map((p) => ({ id: p.id, key: p.key, enabled: p.enabled, requiredLevelId: p.requiredLevelId, requiredBadgeId: p.requiredBadgeId, updatedAt: p.updatedAt })),
      streaks: data.streakRules.map((s) => ({ id: s.id, requiredCount: s.requiredCount, enabled: s.enabled, updatedAt: s.updatedAt })),
    };
    return (
      <>
        <PageHeader inlineActions title={t("title")} />
        <RecognitionEdit
          action={saveRecognitionEdit.bind(null, bound)}
          opened={opened}
          levelOptions={data.levels.map((l) => ({ id: l.id, name: l.name }))}
          badgeOptions={data.badges.filter((b) => b.retiredAt === null).map((b) => ({ id: b.id, name: b.name }))}
        />
      </>
    );
  }

  const avatars = held.certificates.length > 0 ? await listAvatarHrefs(locale, held.certificates.map((c) => c.memberId)) : {};
  const badgeSheet = sp.badge === "new" ? null : sp.badge ? data.badges.find((b) => b.id === sp.badge) : undefined;
  const revoking = sp.revoke ? held.certificates.find((c) => c.id === sp.revoke) : undefined;

  const markLine = mark
    ? mark.actor?.displayName
      ? t.rich("read.savedMarkBy", { time: formatDateTime(mark.at, mark.timeZone, locale), actor: mark.actor.displayName, bdi })
      : t.rich("read.savedMark", { time: formatDateTime(mark.at, mark.timeZone, locale), bdi })
    : null;

  return (
    <>
      <PageHeader
        inlineActions
        title={t("title")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href={`${PATH}?award=1#badge-award`} variant="secondary" size="md">
              {t("read.award")}
            </ButtonLink>
            <ButtonLink href={`${PATH}?badge=new#badge-editor`} variant="secondary" size="md">
              {t("read.newBadge")}
            </ButtonLink>
            <ButtonLink href={`${PATH}?edit`} size="md">
              {t("read.edit")}
            </ButtonLink>
          </div>
        }
      />
      {markLine ? <p className="mt-2 text-caption text-fg-muted">{markLine}</p> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="levels-heading">
          <h2 id="levels-heading" className="sr-only">
            {t("levels.heading")}
          </h2>
          <LevelsTable rows={data.levels.map((l) => ({ id: l.id, name: l.name, thresholdPoints: l.thresholdPoints, sortOrder: l.sortOrder }))} />
        </section>
        <section aria-labelledby="badges-heading">
          <h2 id="badges-heading" className="sr-only">
            {t("badges.heading")}
          </h2>
          <BadgesTable rows={data.badges.map((b) => ({ id: b.id, name: b.name, rule: b.rule, holders: b.holders, retired: b.retiredAt !== null }))} />
        </section>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="perks-heading">
          <SectionHeader as="h2" id="perks-heading" title={t("perks.heading")} />
          <div className="mt-3">
            <PerksTable rows={data.perks.map((p) => ({ id: p.id, key: p.key, enabled: p.enabled, levelName: p.requiredLevelName, badgeName: p.requiredBadgeName }))} />
          </div>
        </section>
        <section aria-labelledby="streaks-heading">
          <SectionHeader as="h2" id="streaks-heading" title={t("streaks.heading")} />
          <div className="mt-3">
            <StreaksTable rows={data.streakRules.map((s) => ({ id: s.id, requiredCount: s.requiredCount, enabled: s.enabled }))} />
          </div>
        </section>
      </div>

      {held.canRelease && held.certificates.length > 0 ? (
        <section aria-labelledby="held-heading" className="mt-10">
          <SectionHeader as="h2" id="held-heading" title={t("held.heading")} count={held.certificates.length} />
          <div className="mt-3">
            <HeldAchievements certificates={held.certificates} avatars={avatars} locale={locale} now={new Date().toISOString()} release={releaseHeldCertificate.bind(null, bound)} />
          </div>
        </section>
      ) : null}

      {badgeSheet !== undefined ? (
        <EditorSurface
          key={badgeSheet?.id ?? "new"}
          id="badge-editor"
          title={badgeSheet ? t.markup("badges.editTitle", { name: badgeSheet.name, bdi: (chunks) => chunks }) : t("badges.newTitle")}
          closeHref={PATH}
          closeLabel={t("common.close")}
        >
          <BadgeSheet
            action={saveBadgeSheet.bind(null, bound)}
            badge={
              badgeSheet
                ? {
                    id: badgeSheet.id,
                    updatedAt: badgeSheet.updatedAt,
                    name: badgeSheet.name,
                    description: badgeSheet.description,
                    issuesCertificate: badgeSheet.issuesCertificate,
                    rule: badgeSheet.rule,
                    retired: badgeSheet.retiredAt !== null,
                  }
                : null
            }
          />
        </EditorSurface>
      ) : null}

      {awarding ? (
        <EditorSurface id="badge-award" title={t("award.heading")} closeHref={PATH} closeLabel={t("common.close")}>
          <AwardForm
            action={awardBadge.bind(null, bound)}
            members={members ?? []}
            badges={data.badges.filter((b) => b.retiredAt === null).map((b) => ({ id: b.id, name: b.name }))}
            timeZone={prefs.timeZone}
            locale={locale}
          />
        </EditorSurface>
      ) : null}

      {revoking ? (
        <EditorSurface id="revoke-editor" title={t.markup("held.stopTitle", { name: revoking.recipientName, bdi: (chunks) => chunks })} closeHref={PATH} closeLabel={t("common.close")}>
          <RevokeSheet action={revokeHeldCertificate.bind(null, bound)} certificateId={revoking.id} />
        </EditorSurface>
      ) : null}
    </>
  );
}
