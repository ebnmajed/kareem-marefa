import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import type { Locale } from "@/i18n/routing";
import { listVenuesForAdmin } from "@/lib/dal/sessions";
import { addVenue } from "./actions";
import { VenueForm } from "./venue-form";
import { VenuesTable } from "./venues-table";

// SCR-046 · /app/admin/venues (REQ-SES-006, REQ-ADM-006), rebuilt onto the
// system for wave 7 (`16` §6.7, `DEC-137`).
//
// ★ There is no delete button, and that is not a UI decision. `venues` has
// `grant select, insert, update` and no delete grant and no delete policy
// (0004), so a venue cannot be deleted by anyone through PostgREST, in use or
// not. REQ-SES-006's "cannot be deleted, only deactivated" is therefore a
// privilege rather than a code path — the page only explains it.
//
// DAL owned by `sessions` (`lib/dal/sessions.ts`, DEC-042's original hand-off
// to `console`, unchanged this wave) — consumed as-is, no request: the
// existing `AdminVenue` DTO already carries every column this rebuild needs.

export default async function VenuesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [venues, t] = await Promise.all([listVenuesForAdmin(locale), getTranslations("admin.venues")]);
  if (venues === null) notFound();

  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />
      <p className="mt-2 max-w-2xl text-body-sm text-fg-muted">{t("noDeleteNote")}</p>

      <section aria-labelledby="add" className="mt-10 max-w-2xl">
        <SectionHeader as="h2" id="add" title={t("addTitle")} />
        <VenueForm action={addVenue.bind(null, locale as Locale)} />
      </section>

      <section aria-labelledby="list" className="mt-12 border-t border-edge pt-8">
        <SectionHeader as="h2" id="list" title={t("listTitle")} />
        <div className="mt-4">
          <VenuesTable venues={venues} locale={locale as Locale} />
        </div>
      </section>
    </>
  );
}
