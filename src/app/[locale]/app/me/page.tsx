import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { getMe, listCompanies } from "@/lib/dal/members";
import { getPointsStripData } from "@/lib/dal/points";
import { formatNumber } from "@/components/sessions/numerals";
import { ProfileForm } from "@/components/me/profile-form";
import type { Locale } from "@/i18n/routing";

// SCR-021 — the member's own profile (REQ-PRF-001), and the hub's own
// landing content, since `/app/me` is itself the first of the seven tabs
// `me/layout.tsx` renders.
//
// The one quick-glance number this track's own data reaches: the points
// balance (`getPointsStripData`, already built for the home page's own
// strip). Not "القادمة"/"الحاضرة"/"المقترحات" — `16` §6.5's canvas names
// those, but they read another track's DAL this wave does not grant
// (`docs/plan/notes/content.md`'s wave-7 plan §1; the lead's ruling).
export default async function MePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [me, companies, points, t] = await Promise.all([
    getMe(locale),
    listCompanies(locale),
    getPointsStripData(locale),
    getTranslations("profile"),
  ]);

  return (
    <>
      <PageHeader
        title={t("title")}
        meta={
          <p className="text-body text-fg-muted">
            <bdi>{me.email}</bdi> · {t(`role.${me.role}`)}
          </p>
        }
      />

      <div className="mt-6 max-w-xs">
        <Stat label={t("nav.points")} value={formatNumber(points.totalPoints)} href="/app/me/points" />
      </div>

      <ProfileForm locale={locale as Locale} me={me} companies={companies} />
    </>
  );
}
