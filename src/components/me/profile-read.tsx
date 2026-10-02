import type { CSSProperties, ReactNode } from "react";
import type { getTranslations } from "next-intl/server";
import type { MyInterests, SelfProfile } from "@/lib/dal/members";
import { teamColorOrNull } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { TagChip } from "@/components/ui/tag-chip";

// SCR-021 in read mode — `Me.dc.html`, `M10c.md` §1, REQ-UIX-071, `DEC-216` §5.12 («read by default, edit on intent»).
//
// ★ NO INPUT EXISTS HERE. The profile is a list of label/value rows and one «عدّل ملفك»; edit mode is a URL,
// `/app/me?edit` (DEC-218 §4.3), so the control is a real link — it works before hydration and survives a reload.
//
// In the artboard's order: «ملفي» as a section heading · one list card — الاسم · الشركة · المسمى الوظيفي · نبذة (or
// «لا توجد نبذة بعد») · الاهتمامات as chips · البريد, Google's, read-only and in `<bdi>` · then the one primary.
// Leaderboard visibility is not a row: it lives on `/app/me/settings` (contract 5).
//
// ★ NO COMPANY (REQ-PRF-001, `M10c.md` §1): the hub says what is blocked — `app.home.companyMissing` — and the
// company row is the way to choose one, a link into edit mode.

type ProfileT = Awaited<ReturnType<typeof getTranslations<"profile">>>;

export interface ProfileReadProps {
  me: SelfProfile;
  companyName: string | null;
  /** The company's team colour (`listCompanies()`), drawn as the row's dot through `--team`; null → the neutral dot. */
  companyTeamColor?: string | null;
  interests: MyInterests["chosen"];
  t: ProfileT;
  /** `members.profile.noBio` — read from `members`' namespace, not written. */
  noBio: string;
  /** `app.home.companyMissing` — the lead's namespace, read. */
  companyMissing: string;
}

export function ProfileRead({ me, companyName, companyTeamColor = null, interests, t, noBio, companyMissing }: ProfileReadProps) {
  const team = teamColorOrNull(companyTeamColor);
  const rows: { label: string; value: ReactNode; muted?: boolean }[] = [
    { label: t("displayName"), value: <bdi>{me.displayName ?? ""}</bdi> },
    {
      label: t("company"),
      value: companyName ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`inline-block size-2.5 shrink-0 rounded-pill ${team ? "bg-team" : "bg-team-neutral"}`}
            style={team ? ({ "--team": team } as CSSProperties) : undefined}
          />
          <bdi>{companyName}</bdi>
        </span>
      ) : (
        <Link href="/app/me?edit" className="font-bold text-fg-heading underline underline-offset-4">
          {t("read.chooseCompany")}
        </Link>
      ),
    },
    ...(me.jobTitle ? [{ label: t("jobTitle"), value: <bdi>{me.jobTitle}</bdi> }] : []),
    me.bio ? { label: t("bio"), value: <bdi className="whitespace-pre-line">{me.bio}</bdi> } : { label: t("bio"), value: noBio, muted: true },
    ...(interests.length
      ? [
          {
            label: t("interests"),
            value: (
              <ul className="flex flex-wrap gap-1.5">
                {interests.map((i) => (
                  <li key={i.id}>
                    <TagChip label={i.name} />
                  </li>
                ))}
              </ul>
            ),
          },
        ]
      : []),
    { label: t("email"), value: <bdi dir="ltr">{me.email}</bdi> },
  ];

  return (
    <section aria-labelledby="profile-heading" className="flex flex-col gap-3">
      {!me.companyId ? (
        <div role="status">
          <Panel tone="info" className="p-3">
            <p className="text-body-sm text-fg-heading">{companyMissing}</p>
          </Panel>
        </div>
      ) : null}
      <SectionHeader as="h2" id="profile-heading" title={t("title")} />
      <Card density="row">
        <dl className="flex w-full min-w-0 flex-col divide-y divide-edge px-3">
          {rows.map((row) => (
            <div key={row.label} className="flex min-w-0 items-start gap-3 py-3">
              <dt className="w-26 shrink-0 pt-0.5 text-caption font-bold text-fg-muted">{row.label}</dt>
              <dd className={`min-w-0 flex-1 text-body-sm ${row.muted ? "text-fg-muted" : "text-fg-heading"}`}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <div>
        <ButtonLink href="/app/me?edit" size="lg">
          {t("read.edit")}
        </ButtonLink>
      </div>
    </section>
  );
}
