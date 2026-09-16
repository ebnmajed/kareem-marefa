import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { listPhotoTakedowns } from "@/lib/dal/admin-moderation";
import { resolveTakedown } from "./actions";
import { TakedownCard } from "./takedown-card";

// SCR-051 · /app/admin/moderation/photos (REQ-ADM-010, REQ-EVT-012,
// DEC-005). The TAKEDOWN queue — already hidden, awaiting review. Distinct
// from SCR-052 (reports), which is NOT yet hidden: opposite urgencies,
// never merged into one list (DEC-005's own wording).

function ageInDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default async function PhotoTakedownPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [takedowns, t] = await Promise.all([listPhotoTakedowns(locale), getTranslations("admin.moderation")]);
  if (takedowns === null) notFound();

  const num = (n: number) => formatNumber(n);
  const action = (takedownId: string, photoId: string) => resolveTakedown.bind(null, locale as Locale, takedownId, photoId);

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("photosTakedownTitle")}</h1>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("photosTakedownIntro")}</p>

      {takedowns.length === 0 ? (
        <p className="mt-8 text-body text-fg-body">{t("photosTakedownEmpty")}</p>
      ) : (
        <ul className="mt-8 grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
          {takedowns.map((tk) => (
            <TakedownCard key={tk.takedownId} action={action(tk.takedownId, tk.photoId)}>
              <p className="text-body-sm text-fg-muted">{t("age", { count: ageInDays(tk.requestedAt), value: num(ageInDays(tk.requestedAt)) })}</p>
              {tk.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a signed URL, not a static/optimizable asset
                <img src={tk.photoUrl} alt="" className="mt-2 aspect-video w-full rounded-field object-cover" />
              ) : null}
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-body-sm">
                <div className="flex gap-2">
                  <dt className="text-fg-muted">{t("uploaderLabel")}</dt>
                  <dd className="text-fg-body">
                    <bdi>{tk.uploaderName ?? "—"}</bdi>
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-fg-muted">{t("sessionLabel")}</dt>
                  <dd className="text-fg-body">
                    <bdi>{tk.sessionTitle}</bdi>
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-fg-muted">{t("requesterLabel")}</dt>
                  <dd className="text-fg-body">
                    <bdi>{tk.requesterName ?? "—"}</bdi>
                  </dd>
                </div>
              </dl>
            </TakedownCard>
          ))}
        </ul>
      )}
    </>
  );
}
