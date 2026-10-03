import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { emailDocumentFor, readBlocks } from "@kareem/mail-runtime";
import { KeysetPager } from "@/components/admin/keyset-pager";
import { EmailThumbnail } from "@/components/email/email-thumbnail";
import { formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { TagChip } from "@/components/ui/tag-chip";
import { redirect } from "@/i18n/navigation";
import { countDeliveryFailures, countSentByKey, getNotificationMatrix, getTemplateCatalogue, listDeliveryLog } from "@/lib/dal/notifications";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { DeliveriesTable } from "./deliveries-table";
import { NewMessage } from "./new-message";

// SCR-058 · /app/admin/emails — the gallery, rebuilt from `AdminEmailGallery.dc.html` (wave 23, REQ-UIX-112,
// REQ-ADM-014, REQ-NTF-007, REQ-NTF-008, DEC-199 §2, DEC-208, DEC-238 §4). Inside the console's frame.
//
// In the artboard's order: the `h1` row with «سجل الإرسال» and «رسالة جديدة»; ★ the failures panel when there is one
// (undrawn, kept — `REQ-NTF-008`); the category chips; a card per message — the outline of its real document (D3), its
// name, whose design it wears (D1: nothing stores a message as on or off, so the badge says what IS stored), and the
// meta line: its kind, whether a member can switch it off (D11, kept from wave 8's matrix), how many times it was sent
// over the retained log (D10). Every figure is read. The message set is `08` §1's, never a literal (D12).
//
// «سجل الإرسال» is `?view=log`: the delivery log as it was — its chips, its table, its pager — because no board draws
// it and its cases are evidence. `?key=` from before the builder redirects to the builder's own route.
//
// Admin only: the DAL answers null for anyone else and the page answers with the streamed not-found (`DEC-134`).

const PATH = "/app/admin/emails";
const RETENTION_DAYS = 180; // OQ-019

export default async function EmailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string; key?: string; status?: string; before?: string; category?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  if (sp.key && /^MSG-[a-z0-9_]{1,60}$/.test(sp.key)) redirect({ href: `${PATH}/${sp.key}`, locale });

  const view = sp.view === "log" ? "log" : "messages";
  const status = sp.status === "all" ? "all" : "failed";

  const [t, tn, catalogue, failures, prefs] = await Promise.all([
    getTranslations("notifications.admin.emails"),
    getTranslations("notifications"),
    getTemplateCatalogue(locale),
    countDeliveryFailures(locale, { days: 7 }),
    getOrgPrefs(locale),
  ]);
  if (!catalogue || failures === null) notFound();

  const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
  // A member's inbox names a reminder by when the session is — «غدًا». In a catalogue of every message an admin needs
  // what the message is, so `names` holds the three timed reminders; every other message keeps the name its member sees.
  const messageName = (key: string) => (t.has(`names.${key}`) ? t(`names.${key}`) : tn.has(`message.${key}`) ? tn(`message.${key}`) : key);

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          view === "messages" ? (
            <div className="flex flex-wrap gap-2">
              <Link href={`${PATH}?view=log`} className={buttonClass("secondary", "md")}>
                {t("gallery.log")}
              </Link>
              <NewMessage
                label={t("gallery.newMessage")}
                title={t("gallery.pickerTitle")}
                listLabel={t("gallery.pickerLabel")}
                ownLabel={t("gallery.own")}
                platformLabel={t("gallery.platform")}
                messages={catalogue.emailMessages.map((key) => ({ key, name: messageName(key), own: catalogue.templates.some((tpl) => tpl.key === key && tpl.channel === "email") }))}
              />
            </div>
          ) : (
            <Link href={PATH} className={buttonClass("secondary", "md")}>
              {t("gallery.backToMessages")}
            </Link>
          )
        }
      />

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

      {view === "messages" ? (
        <Gallery locale={locale} catalogue={catalogue} category={sp.category} messageName={messageName} categoryName={(c) => (tn.has(`category.${c}.name`) ? tn(`category.${c}.name`) : c)} />
      ) : (
        <LogView locale={locale} timeZone={prefs.timeZone} status={status} before={sp.before} messageName={messageName} />
      )}
    </>
  );
}

async function Gallery({
  locale,
  catalogue,
  category,
  messageName,
  categoryName,
}: {
  locale: string;
  catalogue: NonNullable<Awaited<ReturnType<typeof getTemplateCatalogue>>>;
  category?: string;
  messageName: (key: string) => string;
  categoryName: (category: string) => string;
}) {
  const [t, tc, matrix] = await Promise.all([getTranslations("notifications.admin.emails.gallery"), getTranslations("notifications.admin.emails.catalogue"), getNotificationMatrix(locale)]);
  const email = matrix.filter((m) => m.email);
  const sent = await countSentByKey(locale, email.map((m) => m.key));
  if (!sent) notFound();
  const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
  const categories = [...new Set(email.map((m) => m.category))];
  const current = categories.find((c) => c === category) ?? null;
  const shown = current ? email.filter((m) => m.category === current) : email;

  return (
    <>
      <div role="group" aria-label={t("chipsLabel")} className="mt-6 flex flex-wrap gap-2">
        <TagChip label={t("all")} count={email.length} href={PATH} selected={current === null} />
        {categories.map((c) => (
          <TagChip key={c} label={categoryName(c)} href={`${PATH}?category=${encodeURIComponent(c)}`} selected={current === c} />
        ))}
      </div>

      <ul aria-label={t("listLabel")} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {shown.map((m) => {
          const own = catalogue.templates.find((tpl) => tpl.key === m.key && tpl.channel === "email") ?? null;
          const document = emailDocumentFor(m.key, own ? { subject: own.subject, body: own.body, blocks: own.blocks } : null);
          const count = sent.get(m.key) ?? 0;
          return (
            <li key={m.key}>
              <Card href={`${PATH}/${m.key}`} density="compact">
                <div className="flex flex-col gap-2">
                  <EmailThumbnail blocks={readBlocks(document)} />
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-label font-bold text-fg-heading">{messageName(m.key)}</span>
                    <Badge size="sm" tone={own ? "success" : "neutral"} outline={!own}>
                      {own ? t("own") : t("platform")}
                    </Badge>
                  </span>
                  <span className="text-caption text-fg-muted">
                    <span>{categoryName(m.category)}</span> · <span>{m.optional ? tc("optional") : tc("always")}</span> · <span>{t.rich("sent", { count, value: formatNumber(count), bdi })}</span>
                  </span>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
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

