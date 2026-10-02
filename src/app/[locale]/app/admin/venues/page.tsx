import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EditorSurface } from "@/components/admin/editor-surface";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import type { Locale } from "@/i18n/routing";
import { listCompaniesForAdmin } from "@/lib/dal/admin-lists";
import { listVenuesForAdmin } from "@/lib/dal/sessions";
import { saveVenue } from "./actions";
import { VenueForm } from "./venue-form";
import { VenuesTable } from "./venues-table";

// SCR-046 · /app/admin/venues (`REQ-ADM-006`, `REQ-SES-006`, `REQ-ADM-022`, `REQ-UIX-093`), written for wave 22 from
// `AdminVenues.dc.html` (`DEC-208`: deleted first). The job (`DEC-231` §0, `DEC-230` §2.4): the owner sets every
// venue's owning company — one move per row: ⋯ → «عدّل» → the company → «احفظ» — before the hosting rule first runs.
//
// Admin only, decided at the data: `listVenuesForAdmin` answers null to anyone else and the page answers with the
// streamed not-found (`DEC-134`, `REQ-ADM-020`). The layout never gates; the page renders nothing of the frame.
//
// «مكان جديد» and «عدّل» are LINKS — `?new=1`, `?edit=<id>` — so the form renders on the server and works without JS
// (`042`'s precedent, `DEC-232` §5.5); with JS it opens in the sheet. No delete exists: `venues` has no delete grant
// and no delete policy (0004), so deactivating is the only exit (`REQ-SES-006`).

const PATH = "/app/admin/venues";

export default async function VenuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const [venues, companies, t] = await Promise.all([listVenuesForAdmin(locale), listCompaniesForAdmin(locale), getTranslations("admin.venues")]);
  if (venues === null) notFound();

  const editing = typeof sp.edit === "string" ? (venues.find((v) => v.id === sp.edit) ?? null) : null;
  const creating = !editing && sp.new === "1";

  return (
    <>
      <PageHeader
        inlineActions
        title={t("title")}
        actions={
          <ButtonLink href={`${PATH}?new=1#venue-editor`} size="md">
            {t("newVenue")}
          </ButtonLink>
        }
      />

      {creating || editing ? (
        <EditorSurface key={editing?.id ?? "new"} id="venue-editor" title={editing ? t("editTitle") : t("newVenue")} closeHref={PATH} closeLabel={t("closeEditor")}>
          <VenueForm
            action={saveVenue.bind(null, locale as Locale, editing?.id ?? null)}
            venue={editing}
            companies={(companies ?? []).map((c) => ({ id: c.id, name: c.name, deactivated: c.deactivatedAt !== null }))}
            closeHref={PATH}
          />
        </EditorSurface>
      ) : null}

      <div className="mt-6">
        <VenuesTable venues={venues} locale={locale as Locale} />
      </div>
    </>
  );
}
