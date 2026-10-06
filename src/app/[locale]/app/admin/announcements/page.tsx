import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EditorSurface } from "@/components/admin/editor-surface";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import type { Locale } from "@/i18n/routing";
import { listAnnouncementsForAdmin } from "@/lib/dal/announcements";
import { AnnouncementForm } from "./announcement-form";
import { AnnouncementsTable } from "./announcements-table";
import { saveAnnouncement } from "./actions";

// /app/admin/announcements (`REQ-ADM-025`, DEC-267) — an org's announcements, in the console frame. An announcement is
// not a session: a short text every member sees on their home feed and is notified of once, when it goes live.
//
// Admin only, decided at the data (`listAnnouncementsForAdmin` → null → the streamed not-found, `DEC-134`). «إعلان
// جديد» and «عدّل» are LINKS — `?new=1`, `?edit=<id>` — so the form works without JS; with JS it is the sheet
// (`DEC-232` §5.5). The sessions table's «إنشاء» → «إعلان» lands on `?new=1`.

const PATH = "/app/admin/announcements";

export default async function AnnouncementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const [data, t] = await Promise.all([listAnnouncementsForAdmin(locale), getTranslations("announcements")]);
  if (data === null) notFound();

  const editing = typeof sp.edit === "string" ? (data.rows.find((r) => r.id === sp.edit) ?? null) : null;
  const creating = !editing && sp.new === "1";

  return (
    <>
      <PageHeader
        inlineActions
        title={t("title")}
        actions={
          <ButtonLink href={`${PATH}?new=1#announcement-editor`} size="md">
            {t("new")}
          </ButtonLink>
        }
      />

      {creating || editing ? (
        <EditorSurface key={editing?.id ?? "new"} id="announcement-editor" title={editing ? t("editTitle") : t("new")} closeHref={PATH} closeLabel={t("closeEditor")}>
          <AnnouncementForm
            action={saveAnnouncement.bind(null, locale as Locale, editing?.id ?? null)}
            announcement={editing}
            timeZone={data.timeZone}
            closeHref={PATH}
          />
        </EditorSurface>
      ) : null}

      <div className="mt-6">
        <AnnouncementsTable rows={data.rows} timeZone={data.timeZone} locale={locale as Locale} />
      </div>
    </>
  );
}
