import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { KeysetPager } from "@/components/admin/keyset-pager";
import { formatNumber } from "@/components/sessions/numerals";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { TagChip } from "@/components/ui/tag-chip";
import { Tabs } from "@/components/ui/tabs";
import type { Locale } from "@/i18n/routing";
import { countDeliveryFailures, getNotificationMatrix, getTemplateCatalogue, listDeliveryLog } from "@/lib/dal/notifications";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { restoreDefaultTemplate, saveEmailTemplate } from "./actions";
import { DeliveriesTable } from "./deliveries-table";
import { TemplateEditor } from "./template-editor";
import { TemplatesTable, type TemplateCatalogueRow } from "./templates-table";

// SCR-058 · /app/admin/emails — REQ-ADM-014, REQ-NTF-007, REQ-NTF-008, on the M9
// system for wave 8 (K6), rebuilt around WHAT IT DOES TODAY: the string-template
// catalogue with `08` §1's matrix beside it, the trigger's refusal at the field,
// and the delivery log with its reasons. The email studio — blocks, the
// three-pane editor, a preview, «أرسل اختبارًا», the designed library — is M12
// and `notify`'s (`16` §11, `DEC-147`); none of it is here.
//
// Admin only: the DAL answers null for anyone else and the page answers with the
// streamed not-found (`DEC-134`).
//
// The log is the half an admin opens on a bad morning, so a failure in the last
// seven days is said at the top of either view, with the way to it.

const PATH = "/app/admin/emails";
const RETENTION_DAYS = 180; // OQ-019

export default async function EmailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string; key?: string; status?: string; before?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const view = sp.view === "log" ? "log" : "templates";
  const status = sp.status === "all" ? "all" : "failed";
  const bound = locale as Locale;

  const [t, tn, catalogue, failures, prefs] = await Promise.all([
    getTranslations("notifications.admin.emails"),
    getTranslations("notifications"),
    getTemplateCatalogue(locale),
    countDeliveryFailures(locale, { days: 7 }),
    getOrgPrefs(locale),
  ]);
  if (!catalogue || failures === null) notFound();

  const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
  const messageName = (key: string) => (tn.has(`message.${key}`) ? tn(`message.${key}`) : key);
  const selectedKey = view === "templates" && sp.key && catalogue.emailMessages.includes(sp.key) ? sp.key : null;

  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />

      {failures > 0 ? (
        <Panel tone="error" className="mt-6 max-w-3xl">
          <p className="text-body-sm text-fg-heading">
            {t.rich("failures", { count: failures, value: formatNumber(failures), bdi })}{" "}
            <Link href={`${PATH}?view=log&status=failed`} className="underline underline-offset-4">
              {t("failuresLink")}
            </Link>
          </p>
        </Panel>
      ) : null}

      <Tabs
        className="mt-6"
        label={t("tabsLabel")}
        value={view}
        items={[
          { value: "templates", label: t("tabTemplates"), href: PATH },
          { value: "log", label: t("tabLog"), href: `${PATH}?view=log`, count: failures > 0 ? failures : undefined },
        ]}
      />

      {view === "templates" ? (
        selectedKey ? (
          <section aria-labelledby="editor-heading" className="mt-6">
            <Link href={PATH} className="text-body-sm text-fg-heading underline underline-offset-4">
              {t("editor.back")}
            </Link>
            <h2 id="editor-heading" className="mt-3 text-h2 text-fg-heading">
              {t.rich("editor.heading", { name: messageName(selectedKey), bdi })}
            </h2>
            <p className="mt-1 text-caption text-fg-muted">
              <bdi dir="ltr">{selectedKey}</bdi>
            </p>
            <div className="mt-4">
              <TemplateEditor
                messageKey={selectedKey}
                name={messageName(selectedKey)}
                template={catalogue.templates.find((tpl) => tpl.key === selectedKey && tpl.channel === "email") ?? null}
                action={saveEmailTemplate.bind(null, bound)}
                restore={restoreDefaultTemplate.bind(null, bound)}
              />
            </div>
          </section>
        ) : (
          <TemplatesView locale={locale} timeZone={prefs.timeZone} catalogue={catalogue} messageName={messageName} categoryName={(c) => (tn.has(`category.${c}.name`) ? tn(`category.${c}.name`) : c)} />
        )
      ) : (
        <LogView locale={locale} timeZone={prefs.timeZone} status={status} before={sp.before} messageName={messageName} />
      )}
    </>
  );
}

async function TemplatesView({
  locale,
  timeZone,
  catalogue,
  messageName,
  categoryName,
}: {
  locale: string;
  timeZone: string;
  catalogue: NonNullable<Awaited<ReturnType<typeof getTemplateCatalogue>>>;
  messageName: (key: string) => string;
  categoryName: (category: string) => string;
}) {
  const matrix = await getNotificationMatrix(locale);
  const rows: TemplateCatalogueRow[] = matrix
    .filter((m) => m.email)
    .map((m) => {
      const own = catalogue.templates.find((tpl) => tpl.key === m.key && tpl.channel === "email");
      return { key: m.key, name: messageName(m.key), category: categoryName(m.category), inApp: m.inApp, email: m.email, optional: m.optional, overriddenAt: own?.updatedAt ?? null };
    });
  return (
    <section className="mt-6">
      <TemplatesTable rows={rows} timeZone={timeZone} locale={locale} />
    </section>
  );
}

async function LogView({ locale, timeZone, status, before, messageName }: { locale: string; timeZone: string; status: "failed" | "all"; before?: string; messageName: (key: string) => string }) {
  const [t, page] = await Promise.all([getTranslations("notifications.admin.emails.deliveries"), listDeliveryLog(locale, { status, before })]);
  if (!page) notFound();
  const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
  const base = `${PATH}?view=log&status=${status}`;
  return (
    <section aria-labelledby="deliveries-heading" className="mt-6">
      <SectionHeader as="h2" id="deliveries-heading" title={t("heading")} description={t("intro")} />
      <p className="mt-2 max-w-3xl text-body-sm text-fg-muted">
        {t("bounceNote")} {t.rich("retention", { count: RETENTION_DAYS, value: formatNumber(RETENTION_DAYS), bdi })}
      </p>
      <div role="group" aria-label={t("filterLabel")} className="mt-4 flex flex-wrap gap-2">
        <TagChip label={t("filterFailed")} href={`${PATH}?view=log&status=failed`} selected={status === "failed"} />
        <TagChip label={t("filterAll")} href={`${PATH}?view=log&status=all`} selected={status === "all"} />
      </div>
      <div className="mt-4">
        <DeliveriesTable
          rows={page.rows.map((r) => ({ ...r, name: messageName(r.key) }))}
          timeZone={timeZone}
          locale={locale}
          empty={
            status === "failed"
              ? { title: t("emptyFailedTitle"), action: { label: t("showAll"), href: `${PATH}?view=log&status=all` } }
              : { title: t("emptyAllTitle"), action: { label: t("toTemplates"), href: PATH } }
          }
        />
      </div>
      <KeysetPager
        label={t("pagerLabel")}
        olderHref={page.nextBefore ? `${base}&before=${encodeURIComponent(page.nextBefore)}` : null}
        olderLabel={t("older")}
        newestHref={before ? base : null}
        newestLabel={t("newest")}
      />
    </section>
  );
}
