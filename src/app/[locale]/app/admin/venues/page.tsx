import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { listVenuesForAdmin } from "@/lib/dal/sessions";
import { addVenue, toggleVenue } from "./actions";
import { VenueForm } from "./venue-form";

// SCR-046 · /app/admin/venues (REQ-SES-006, REQ-ADM-006).
//
// ★ There is no delete button, and that is not a UI decision. `venues` has
// `grant select, insert, update` and no delete grant and no delete policy
// (0004), so a venue cannot be deleted by anyone through PostgREST, in use or
// not. REQ-SES-006's "cannot be deleted, only deactivated" is therefore a
// privilege rather than a code path — the page only explains it.
//
// Owned by `sessions` for wave 1, handed to `console` at wave 3 (DEC-042).

export default async function VenuesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [venues, t] = await Promise.all([listVenuesForAdmin(locale), getTranslations("admin.venues")]);
  if (venues === null) notFound();

  const num = (n: number) => formatNumber(n);

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("intro")}</p>
      <p className="mt-2 max-w-2xl text-body-sm text-fg-muted">{t("noDeleteNote")}</p>

      <section aria-labelledby="add" className="mt-10 max-w-2xl">
        <h2 id="add" className="text-h2 text-fg-heading">
          {t("addTitle")}
        </h2>
        <VenueForm action={addVenue.bind(null, locale as Locale)} />
      </section>

      <section aria-labelledby="list" className="mt-12 max-w-2xl border-t border-edge pt-8">
        <h2 id="list" className="text-h2 text-fg-heading">
          {t("listTitle")}
        </h2>
        {venues.length === 0 ? (
          <p className="mt-3 text-body text-fg-body">{t("empty")}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {venues.map((v) => {
              const active = v.deactivatedAt === null;
              return (
                <li key={v.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-field border border-edge p-4">
                  <div className="min-w-0">
                    <p className="text-label text-fg-heading">
                      <bdi>{v.name}</bdi>
                      {!active ? <span className="ms-2 text-body-sm font-normal text-fg-muted">{t("deactivated")}</span> : null}
                    </p>
                    {v.address ? (
                      <p className="mt-1 text-body-sm text-fg-muted">
                        <bdi>{v.address}</bdi>
                      </p>
                    ) : null}
                    <p className="mt-1 text-body-sm text-fg-muted">
                      {v.capacity !== null ? <bdi>{t("seats", { count: v.capacity, value: num(v.capacity) })}</bdi> : t("noCapacity")}
                      {" · "}
                      <bdi>{t("upcoming", { count: v.upcomingSessions, value: num(v.upcomingSessions) })}</bdi>
                      {v.timeZone ? (
                        <>
                          {" · "}
                          <bdi dir="ltr">{v.timeZone}</bdi>
                        </>
                      ) : null}
                    </p>
                    {v.mapUrl ? (
                      <a href={v.mapUrl} rel="noreferrer noopener" target="_blank" className="mt-1 block text-body-sm text-fg-heading underline underline-offset-4">
                        {t("mapLabel")}
                      </a>
                    ) : null}
                  </div>
                  <form action={toggleVenue.bind(null, locale as Locale, v.id, !active)} className="ms-auto">
                    <button type="submit" className="inline-flex h-11 items-center rounded-field border border-edge-strong px-4 text-body-sm text-fg-heading hover:bg-silver-100">
                      {active ? t("deactivate") : t("activate")}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
