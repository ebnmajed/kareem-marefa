import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import { getPreferenceMatrix, getTemplateCatalogue, listDeliveries } from "@/lib/dal/notifications";
import { removeEmailTemplate, saveEmailTemplate } from "./actions";

// SCR-058 · /app/admin/emails — REQ-ADM-014, REQ-NTF-007, REQ-NTF-008.
//
// Owned by `notify` for wave 2, handed to `console` at wave 3 (DEC-042's
// pattern).
//
// Two halves, and the second is the one an admin opens on a bad morning:
// REQ-NTF-008 says a bounce or failure is visible WITH THE REASON, so the
// delivery log renders `error` rather than a status pill that means
// "something went wrong, ask an engineer".
//
// Every template is Arabic-first and RTL (08 §3.1). The editor does not
// validate the required fields itself — the `notification_templates_validate`
// trigger does, for every writer, and this screen renders its refusal.

const field = "mt-1 block w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading";

export default async function EmailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string; key?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { saved, error, key } = await searchParams;

  const [t, catalogue, deliveries, prefs] = await Promise.all([
    getTranslations("notifications"),
    getTemplateCatalogue(locale),
    listDeliveries(locale),
    getPreferenceMatrix(locale),
  ]);
  if (!catalogue || !deliveries) notFound();

  const byKey = new Map(catalogue.templates.filter((tpl) => tpl.channel === "email").map((tpl) => [tpl.key, tpl]));
  const selected = key && catalogue.emailMessages.includes(key) ? key : catalogue.emailMessages[0];
  const current = selected ? byKey.get(selected) : undefined;
  const errorKey = error && ["missing_required_field", "unknown_message_key", "not_permitted"].includes(error) ? error : "generic";

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("admin.emails.title")}</h1>
      <p className="mt-2 text-body text-fg-muted">{t("admin.emails.intro")}</p>

      {saved ? (
        <p role="status" className="mt-4 rounded-field border border-edge bg-silver-100 p-3 text-body text-fg-heading">
          {t("admin.emails.saved")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-field border border-edge-strong p-3 text-body text-fg-heading">
          {t(`admin.emails.errors.${errorKey}`)}
        </p>
      ) : null}

      <section aria-labelledby="template-heading" className="mt-10">
        <h2 id="template-heading" className="text-h2 text-fg-heading">
          {t("admin.emails.templateHeading")}
        </h2>

        <ul className="mt-4 flex flex-wrap gap-2">
          {catalogue.emailMessages.map((msg) => (
            <li key={msg}>
              <a
                href={`?key=${encodeURIComponent(msg)}`}
                aria-current={msg === selected ? "true" : undefined}
                className={`inline-flex h-11 items-center rounded-field border px-4 text-label ${
                  msg === selected ? "border-edge-strong bg-silver-100 text-fg-heading" : "border-edge text-fg-body hover:border-edge-strong"
                }`}
              >
                {t(`message.${msg}`)}
              </a>
            </li>
          ))}
        </ul>

        {selected ? (
          <>
            <p className="mt-4 text-body-sm text-fg-muted">{current ? t("admin.emails.overridden") : t("admin.emails.usingDefault")}</p>
            <form action={saveEmailTemplate} className="mt-4 max-w-2xl space-y-5">
              <input type="hidden" name="key" value={selected} />
              <div>
                <label htmlFor="subject" className="text-label text-fg-heading">
                  {t("admin.emails.subject")}
                </label>
                <input id="subject" name="subject" required maxLength={200} defaultValue={current?.subject ?? ""} className={field} />
              </div>
              <div>
                <label htmlFor="body" className="text-label text-fg-heading">
                  {t("admin.emails.body")}
                </label>
                {/* No `overflow: hidden` anywhere near a text line — it clips
                    tashkeel (10 §2). A textarea scrolls, which is fine. */}
                <textarea id="body" name="body" required rows={10} maxLength={20000} defaultValue={current?.body ?? ""} className={`${field} leading-[1.7]`} />
              </div>
              <div>
                <label htmlFor="requiredFields" className="text-label text-fg-heading">
                  {t("admin.emails.requiredFields")}
                </label>
                <input
                  id="requiredFields"
                  name="requiredFields"
                  dir="ltr"
                  defaultValue={(current?.requiredFields ?? []).join(", ")}
                  className={`${field} text-start`}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="inline-flex h-12 items-center rounded-field bg-[var(--btn-bg)] px-7 text-label text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)]"
                >
                  {t("admin.emails.save")}
                </button>
              </div>
            </form>
            {current ? (
              <form action={removeEmailTemplate} className="mt-3">
                <input type="hidden" name="id" value={current.id} />
                <button type="submit" className="text-label text-fg-muted underline underline-offset-4 hover:text-fg-heading">
                  {t("admin.emails.remove")}
                </button>
              </form>
            ) : null}
          </>
        ) : null}
      </section>

      <section aria-labelledby="deliveries-heading" className="mt-12">
        <h2 id="deliveries-heading" className="text-h2 text-fg-heading">
          {t("admin.emails.deliveries.heading")}
        </h2>
        <p className="mt-2 text-body-sm text-fg-muted">
          {/* OQ-019's 180 days, in the org's numeral system like every other
              number on the screen (REQ-INT-006). */}
          {t.rich("admin.emails.deliveries.retention", {
            days: formatNumber(180),
            bdi: (chunks) => <bdi>{chunks}</bdi>,
          })}
        </p>

        {deliveries.length === 0 ? (
          <p className="mt-4 rounded-field border border-edge p-4 text-body text-fg-muted">{t("admin.emails.deliveries.empty")}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {deliveries.map((delivery) => (
              <li
                key={delivery.id}
                className={`rounded-field border p-4 ${delivery.status === "bounced" || delivery.status === "failed" ? "border-edge-strong" : "border-edge"}`}
              >
                <p className="text-label text-fg-heading">{t(`message.${delivery.key}`)}</p>
                <p className="mt-1 text-body-sm text-fg-body">
                  <bdi>{delivery.member?.displayName ?? "—"}</bdi> · {t(`admin.emails.deliveries.state.${delivery.status}`)}
                </p>
                {/* REQ-NTF-008: with the reason. */}
                {delivery.error ? (
                  <p className="mt-1 text-body-sm text-fg-heading">
                    {t("admin.emails.deliveries.reason")}: <bdi>{delivery.error}</bdi>
                  </p>
                ) : null}
                <p className="mt-1 text-body-sm text-fg-muted">
                  {formatDateTime(delivery.sentAt ?? delivery.createdAt, prefs.timeZone, locale)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
