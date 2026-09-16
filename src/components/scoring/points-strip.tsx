import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/components/sessions/numerals";
import { getPointsStripData } from "@/lib/dal/points";

// The home page's <PointsStrip> slot (docs/plan/notes/scoring.md). Server
// component, own data through the scoring DAL, ids never rows, no heading
// of its own — the home page owns its own landmarks. `memberId` is taken
// for the slot's shared contract shape even though getPointsStripData()
// re-derives it from the session cookie itself, same as every other slot.
export type PointsStripProps = { memberId: string; locale: string };

export async function PointsStrip({ locale }: PointsStripProps) {
  const [t, data] = await Promise.all([getTranslations("scoring.points"), getPointsStripData(locale)]);
  const value = formatNumber(data.totalPoints);

  return (
    <div className="rounded-field border border-edge bg-canvas p-4">
      <p className="text-body text-fg-heading">{t("balance", { count: data.totalPoints, value })}</p>
      <Link href="/app/me/points" className="mt-2 inline-block text-label text-fg-heading underline underline-offset-4">
        {t("strip.cta")}
      </Link>
    </div>
  );
}
