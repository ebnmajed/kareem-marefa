import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDate, formatNumber } from "@/components/sessions/numerals";
import { Avatar } from "@/components/ui/avatar";
import { Badge, SessionStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { Stat } from "@/components/ui/stat";
import { TagChip } from "@/components/ui/tag-chip";
import { getMemberProfileForViewer } from "@/lib/dal/members";
import { sessionPhase } from "@/lib/session-status";

// SCR-020 · /app/members/[id] — a profile, at the viewer's tier (REQ-PRF-004,
// A33), on the M9 system for wave 7 (DEC-137, DEC-141 ruling 4).
//
// ★ THIS COMPONENT DOES NOT DECIDE WHAT A TIER SEES. `getMemberProfileForViewer`
// does, in the DAL: a field the viewer may not see never reaches this file, so
// there is no condition here that could leak it through a search result, a
// payload or a later edit. The page only draws what it was handed.
//
//   every tier   name, company, job title, role, bio, interests; points, rank,
//                level and streak (hidden for an opted-out member, DEC-141
//                ruling 5); badges; the sessions they presented
//   self         the same — «هكذا يرى زملاؤك ملفك» — and the way to /app/me,
//                where everything self-only lives and can be edited
//   admin        the same, plus email, attendance, no-shows and late
//                cancellations from `admin_member_profile()`
//
// Not this wave: «الصور التي رفعها» (DEC-141 ruling 4c) and «التقييمات التي
// قدّمها» for an admin (4d — it needs an audited read, REQ-RAT-005). Avatars are
// initials over a tint keyed to the member id (DEC-099, REQ-PRF-009).
//
// A missing, deactivated or other-org id is `notFound()` — one answer for all,
// under `/app` DEC-134's streamed not-found.

export default async function MemberPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [view, t] = await Promise.all([getMemberProfileForViewer(locale, id), getTranslations("members.profile")]);
  if (!view) notFound();

  const { profile, tier, standing, recognition, presented, adminRecord } = view;
  const now = new Date();

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <Avatar memberId={profile.id} displayName={profile.displayName} size={96} decorative />
        <PageHeader
          className="flex-1"
          status={
            profile.role === "member" ? undefined : (
              <Badge tone="info" size="sm">
                {t(`role.${profile.role}`)}
              </Badge>
            )
          }
          title={profile.displayName ?? t("none")}
          meta={
            view.companyName || profile.jobTitle ? (
              <p className="text-body text-fg-muted">
                {view.companyName ? <bdi>{view.companyName}</bdi> : null}
                {view.companyName && profile.jobTitle ? " · " : null}
                {profile.jobTitle ? <bdi>{profile.jobTitle}</bdi> : null}
              </p>
            ) : undefined
          }
        />
      </div>

      {tier === "self" ? (
        <Panel tone="info" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body text-fg-body">{t("selfNote")}</p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/app/me" variant="primary" size="md">
              {t("editProfile")}
            </ButtonLink>
            <ButtonLink href="/app/me/points" variant="secondary" size="md">
              {t("myPoints")}
            </ButtonLink>
          </div>
        </Panel>
      ) : null}

      <section aria-labelledby="bio" className="flex flex-col gap-3">
        <SectionHeader id="bio" title={t("bio")} />
        <p className={`max-w-prose whitespace-pre-line text-body-lg ${profile.bio ? "text-fg-body" : "text-fg-muted"}`}>{profile.bio ? <bdi>{profile.bio}</bdi> : t("noBio")}</p>
        {view.interests.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-label text-fg-heading">{t("interests")}</h3>
            <div className="flex flex-wrap gap-2">
              {view.interests.map((interest) => (
                <TagChip key={interest.id} label={interest.name} />
              ))}
            </div>
          </div>
        ) : null}
        <p className="text-caption text-fg-muted">{t("memberSince", { date: formatDate(profile.createdAt, view.timeZone, locale) })}</p>
      </section>

      {standing ? (
        <section aria-labelledby="standing" className="flex flex-col gap-4">
          <SectionHeader id="standing" title={t("standing")} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("points")} value={formatNumber(standing.totalPoints)} />
            <Stat label={t("rank")} value={standing.rank !== null ? formatNumber(standing.rank) : t("none")} />
            <Stat label={t("level")} value={standing.levelName ?? t("none")} />
            <Stat label={t("streak")} value={t("streakValue", { count: recognition.streakMonths, value: formatNumber(recognition.streakMonths) })} />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="badges" className="flex flex-col gap-3">
        <SectionHeader id="badges" title={t("badges")} count={recognition.badges.length > 0 ? recognition.badges.length : undefined} />
        {recognition.badges.length === 0 ? (
          <p className="text-body text-fg-muted">{t("noBadges")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {recognition.badges.map((badge) => (
              <li key={badge.id} className="rounded-card border border-edge bg-surface px-3 py-2">
                <p className="text-label text-fg-heading">
                  <bdi>{badge.name}</bdi>
                </p>
                {badge.description ? (
                  <p className="text-caption text-fg-muted">
                    <bdi>{badge.description}</bdi>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="presented" className="flex flex-col gap-3">
        <SectionHeader id="presented" title={t("presented")} count={presented.length > 0 ? presented.length : undefined} />
        {presented.length === 0 ? (
          <p className="text-body text-fg-muted">{t("noPresented")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {presented.map((s) => (
              <li key={s.id}>
                <Card density="row" href={`/app/sessions/${s.id}`}>
                  <CardBody>
                    <SessionStatusBadge phase={sessionPhase(s, now)} size="sm" />
                    <h3 className="text-body text-fg-heading">
                      <bdi>{s.title}</bdi>
                    </h3>
                    {s.startsAt ? <p className="text-body-sm text-fg-muted">{formatDate(s.startsAt, s.timeZone, locale)}</p> : null}
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {adminRecord ? (
        <section aria-labelledby="admin-record" className="flex flex-col gap-4 border-t border-edge pt-8">
          <SectionHeader id="admin-record" title={t("admin.heading")} description={t("admin.note")} />
          <dl>
            <dt className="text-label text-fg-heading">{t("admin.email")}</dt>
            <dd className="mt-1 text-body text-fg-body">
              <bdi dir="ltr">{adminRecord.email}</bdi>
            </dd>
          </dl>
          <div className="grid grid-cols-3 gap-3">
            <Stat label={t("admin.attendedCount")} value={formatNumber(adminRecord.attendedCount)} />
            <Stat label={t("admin.noShows")} value={formatNumber(adminRecord.noShowCount)} />
            <Stat label={t("admin.lateCancels")} value={formatNumber(adminRecord.lateCancelCount)} />
          </div>
          <h3 className="text-label text-fg-heading">{t("admin.attended")}</h3>
          {adminRecord.attended.length === 0 ? (
            <p className="text-body text-fg-muted">{t("admin.noAttended")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {adminRecord.attended.map((a) => (
                <li key={a.sessionId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-edge py-2 text-body">
                  <bdi className="text-fg-heading">{a.title}</bdi>
                  {a.startsAt ? <span className="text-body-sm text-fg-muted">{formatDate(a.startsAt, view.timeZone, locale)}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
