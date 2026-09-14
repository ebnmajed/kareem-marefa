import { getTranslations } from "next-intl/server";
import { listHeldAchievements } from "@/lib/dal/certificates";
import { releaseAchievements } from "@/components/certificates/actions";

// The `HeldAchievements` slot — REQ-CRT-012.
//
// «Leaderboard certificates go to the top 3 monthly and top 3 annual,
// issued from the frozen snapshot and RELEASED BY AN ADMIN.» SCR-045 is
// per session and an achievement certificate has no session, so `09` gives
// this nowhere to live. Rather than open a route in another track's folder,
// it is a slot: the recognition screen (SCR-054, `scoring`'s) renders
// `<HeldAchievements locale />` and imports nothing else.
//
// RENDERS NOTHING when there is nothing held, which is the normal state.
// A permanently empty section on a screen about badges and levels would be
// noise every day of the year except the first of the month.
//
// No heading of its own above h3: the host page owns the landmark.
export async function HeldAchievements({ locale }: { locale: string }) {
  const { certificates, canRelease } = await listHeldAchievements(locale);
  if (!canRelease || certificates.length === 0) return null;

  const t = await getTranslations("certificates");

  return (
    <section className="mt-8 rounded-card border border-edge p-4">
      <h3 className="text-h3 text-fg-heading">{t("achievements.heading")}</h3>
      <p className="mt-1 max-w-2xl text-body-sm text-fg-muted">{t("achievements.intro")}</p>

      <form action={releaseAchievements} className="mt-4">
        <ul className="flex flex-col gap-2">
          {certificates.map((c) => (
            <li key={c.id}>
              <label className="flex flex-wrap items-baseline gap-3 rounded-field border border-edge p-3">
                <input type="checkbox" name="id" value={c.id} className="size-4" />
                <span className="text-body text-fg-heading">
                  <bdi>{c.recipientName}</bdi>
                </span>
                {c.achievementName ? (
                  <span className="text-body-sm text-fg-muted">
                    <bdi>{c.achievementName}</bdi>
                  </span>
                ) : null}
                <span className="text-body-sm text-fg-muted">
                  {t("review.serial")} <bdi dir="ltr">{c.serial}</bdi>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <button type="submit" className="mt-4 inline-flex h-11 items-center rounded-field bg-navy-900 px-4 text-label text-canvas">
          {t("review.release")}
        </button>
      </form>
    </section>
  );
}
