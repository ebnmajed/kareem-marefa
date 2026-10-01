import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { Avatar } from "@/components/ui/avatar";
import { BadgeMedallion } from "@/components/ui/badge-medallion";
import { StarIcon } from "@/components/ui/icons";
import { TagChip } from "@/components/ui/tag-chip";
import { formatMonthYear } from "@/components/members/profile-format";
import type { MemberProfileView } from "@/lib/dal/members";

// The header card — `Profile.dc.html:25-36`, `ProfileDesktop.dc.html:38-49`, REQ-PRF-001, A33 tier 1.
//
// The avatar with its team ring at the inline-start (`09` SCR-020) — 84 px on the phone, 104 from `lg` — the name
// as the page's one `h1`, exactly the name (`wave7-sessions-profile.spec.ts`); the job title and a staff member's
// role; the company chip with its dot and «عضو منذ …»; the bio or `noBio`; the interests. From `lg` the card also
// carries, at its end, the level's medallion and a one-line summary (`ProfileDesktop.dc.html:48`) — the phone has
// the same facts in the standing card, so each is `display: none` at the other width and is read once.
// Everything here is what the DAL handed: a withheld balance or rank arrives as null and reads «—».
export async function ProfileHeader({ view, locale }: { view: MemberProfileView; locale: string }) {
  const t = await getTranslations("members.profile");
  const { profile } = view;
  const name = profile.displayName ?? t("none");
  const teamColor = view.company?.teamColor ?? null;
  const dash = t("none");
  const summary = [
    view.standing ? `${formatNumber(view.standing.totalPoints)} ${t("pointsUnit", { count: view.standing.totalPoints })}` : dash,
    `${view.monthRank !== null ? t("rankValue", { value: formatNumber(view.monthRank) }) : dash} ${t("monthRank")}`,
    view.recognition.streakMonths > 0 ? t("streakFigure", { value: formatNumber(view.recognition.streakMonths) }) : dash,
  ].join(" · ");

  // ★ ONE DOM AT BOTH WIDTHS — one `h1`. A grid places it: on the phone the avatar and the name side by side, the
  // bio and the interests under them; from `lg` the avatar spans the card's height, the summary stands at its end.
  return (
    <div
      data-slot="profile-header"
      className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-panel border border-edge bg-surface p-4 [grid-template-areas:'avatar_ident'_'bio_bio'_'tags_tags'] lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-x-6 lg:gap-y-2 lg:px-6 lg:py-5 lg:[grid-template-areas:'avatar_ident_summary'_'avatar_bio_summary'_'avatar_tags_summary']"
    >
      <div className="[grid-area:avatar] lg:self-center">
        <span className="flex lg:hidden">
          <Avatar memberId={profile.id} displayName={profile.displayName} src={profile.avatarUrl} size={84} teamColor={teamColor} decorative />
        </span>
        <span className="hidden lg:flex">
          <Avatar memberId={profile.id} displayName={profile.displayName} src={profile.avatarUrl} size={104} teamColor={teamColor} decorative />
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 [grid-area:ident] lg:self-end">
        <div className="flex flex-col gap-0.5 lg:flex-row lg:flex-wrap lg:items-baseline lg:gap-x-3.5">
          <h1 className="font-display text-play-md font-extrabold leading-tight text-fg-heading">
            <bdi>{name}</bdi>
          </h1>
          <Subtitle view={view} />
        </div>
        <CompanyLine view={view} locale={locale} />
      </div>
      <p className="max-w-prose whitespace-pre-line text-body text-fg-muted [grid-area:bio]">{profile.bio ? <bdi>{profile.bio}</bdi> : t("noBio")}</p>
      {view.interests.length > 0 ? (
        <ul aria-label={t("interests")} className="flex flex-wrap gap-1.5 [grid-area:tags] lg:self-start">
          {view.interests.map((interest) => (
            <li key={interest.id}>
              <TagChip label={`#${interest.name}`} />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="hidden flex-col items-center gap-1.5 rounded-panel bg-raised px-4.5 py-3.5 [grid-area:summary] lg:flex" role="group" aria-label={t("summaryLabel")}>
        {view.level ? (
          <>
            <BadgeMedallion name={view.level.name} fill={{ level: view.level.tier }} glyph={<StarIcon filled />} size="sm" showName={false} />
            <p className={`font-display text-play-sm font-extrabold leading-none ${RAMP_TEXT[stop(view.level.tier) - 1]}`}>
              <bdi>{view.level.name}</bdi>
            </p>
          </>
        ) : (
          <p className="text-caption font-bold text-fg-muted">{t("noLevel")}</p>
        )}
        <p className="text-caption text-fg-muted">{summary}</p>
      </div>
    </div>
  );
}

// Literal strings, so Tailwind sees every class — `01-tokens.md`'s ramp, keyed on `sort_order` (DEC-214 §3 N4).
const RAMP_TEXT = ["text-level-1", "text-level-2", "text-level-3", "text-level-4", "text-level-5"] as const;
const stop = (tier: number) => Math.min(5, Math.max(1, Math.round(tier) || 1));

async function Subtitle({ view }: { view: MemberProfileView }) {
  const t = await getTranslations("members.profile");
  const { profile } = view;
  if (!profile.jobTitle && profile.role === "member") return null;
  return (
    <p className="text-body text-fg-muted">
      {profile.jobTitle ? <bdi>{profile.jobTitle}</bdi> : null}
      {profile.jobTitle && profile.role !== "member" ? " · " : null}
      {profile.role !== "member" ? <span className="font-semibold">{t(`role.${profile.role}`)}</span> : null}
    </p>
  );
}

async function CompanyLine({ view, locale }: { view: MemberProfileView; locale: string }) {
  const t = await getTranslations("members.profile");
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <TagChip label={view.company?.name ?? t("noCompany")} teamColor={view.company?.teamColor ?? null} />
      <span className="text-caption text-fg-muted">{t.rich("memberSince", { date: formatMonthYear(view.profile.createdAt, view.timeZone, locale), bdi: (chunks) => <bdi>{chunks}</bdi> })}</span>
      {/* «· 6 جلسات مقدَّمة» — drawn on desktop (`ProfileDesktop.dc.html:44`); the phone says it in the heading's count. */}
      {view.presentedCount > 0 ? (
        <span className="hidden text-caption text-fg-muted lg:inline">· {t("presentedCount", { count: view.presentedCount, value: formatNumber(view.presentedCount) })}</span>
      ) : null}
    </div>
  );
}
