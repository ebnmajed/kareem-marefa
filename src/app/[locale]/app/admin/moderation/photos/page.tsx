import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { ModerationTabs } from "@/components/admin/moderation-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { listModerationCounts, listPhotoTakedowns } from "@/lib/dal/admin-moderation";
import { resolveTakedown } from "./actions";
import { TakedownCard } from "./takedown-card";

// SCR-051 · /app/admin/moderation/photos (REQ-ADM-010, REQ-EVT-012,
// DEC-005), rebuilt onto the system for wave 7 (`16` §6.7, `DEC-137`). The
// TAKEDOWN queue — already hidden, awaiting review. Distinct from SCR-052
// (reports), which is NOT yet hidden: opposite urgencies, never merged into
// one list (DEC-005's own wording) — the `ModerationTabs` strip below moves
// a moderator between the two without merging them.

function ageInDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default async function PhotoTakedownPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [takedowns, counts, t] = await Promise.all([listPhotoTakedowns(locale), listModerationCounts(locale), getTranslations("admin.moderation")]);
  if (takedowns === null || counts === null) notFound();

  const num = (n: number) => formatNumber(n);
  const action = (takedownId: string, photoId: string) => resolveTakedown.bind(null, locale as Locale, takedownId, photoId);

  return (
    <>
      <PageHeader title={t("photosTakedownTitle")} description={t("photosTakedownIntro")} />
      <div className="mt-6">
        <ModerationTabs current="photos" counts={counts} />
      </div>

      {takedowns.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={t("photosTakedownEmpty")} action={{ label: t("photosTakedownEmptyAction"), href: "/app/admin" }} />
        </div>
      ) : (
        <ul className="mt-8 grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
          {takedowns.map((tk) => (
            <li key={tk.takedownId}>
              <TakedownCard action={action(tk.takedownId, tk.photoId)} photoUrl={tk.photoUrl} sessionTitle={tk.sessionTitle}>
                <p className="text-body-sm text-fg-muted">{t("age", { count: ageInDays(tk.requestedAt), value: num(ageInDays(tk.requestedAt)) })}</p>
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
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
