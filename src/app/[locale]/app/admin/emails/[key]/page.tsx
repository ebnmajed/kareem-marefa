import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { defaultTemplate, emailDocumentFor } from "@kareem/mail-runtime";
import { EmailBuilder } from "@/components/email/builder";
import type { Locale } from "@/i18n/routing";
import { getMessageBindings, getPreviewSession, getTemplateCatalogue } from "@/lib/dal/notifications";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { requireSession } from "@/lib/dal/session";
import { restoreDefaultTemplate, saveEmailDesign, sendTestEmailAction } from "../actions";

// SCR-058 · /app/admin/emails/[key] — one message's block builder (wave 23, REQ-UIX-112, REQ-NTF-009 … REQ-NTF-015,
// DEC-237 §5.5, DEC-238 §4). `[key]` is the `MSG-*` key as `08` §1 writes it; anything the matrix does not give an
// email channel is the not-found page. The route renders bare (the studio frame): the builder draws its own bar.
//
// ★ EVERY KEY OPENS AS A DESIGN — the one the org SENDS today (`emailDocumentFor()`, the renderer's own resolution):
// its saved design; for a string row (DEC-081) its words as paragraphs in the design's frame, which is what it already
// sends; for an untouched key its platform design (REQ-NTF-014). Nothing is written until «احفظ وفعّل».
//
// Admin only: `getTemplateCatalogue()` is null for anyone else, and the page answers with the not-found (`DEC-134`).

export default async function EmailBuilderPage({ params }: { params: Promise<{ locale: string; key: string }> }) {
  const { locale, key } = await params;
  setRequestLocale(locale);
  const [t, tn, catalogue, prefs] = await Promise.all([
    getTranslations("notifications.admin.emails"),
    getTranslations("notifications"),
    getTemplateCatalogue(locale),
    getOrgPrefs(locale),
  ]);
  if (!catalogue || !catalogue.emailMessages.includes(key)) notFound();

  const [bindings, session, me] = await Promise.all([getMessageBindings(locale), getPreviewSession(locale), requireSession(locale)]);
  const own = catalogue.templates.find((tpl) => tpl.key === key && tpl.channel === "email") ?? null;
  const document = emailDocumentFor(key, own ? { subject: own.subject, body: own.body, blocks: own.blocks } : null);
  if (!document) notFound();
  const name = t.has(`names.${key}`) ? t(`names.${key}`) : tn.has(`message.${key}`) ? tn(`message.${key}`) : key;
  const bound = locale as Locale;

  return (
    <EmailBuilder
      // A restore replaces what is stored; a fresh key remounts the builder on it rather than keeping a stale history.
      key={own?.updatedAt ?? "platform"}
      messageKey={key}
      name={name}
      initialSubject={own?.subject ?? defaultTemplate(key)?.subject ?? ""}
      initialBlocks={document}
      templateId={own?.id ?? null}
      savedAt={own?.updatedAt ?? null}
      isStringRow={own !== null && own.blocks === null}
      offered={bindings.get(key) ?? []}
      timeZone={prefs.timeZone}
      locale={locale}
      session={session}
      email={me.email}
      action={saveEmailDesign.bind(null, bound)}
      sendTest={sendTestEmailAction.bind(null, bound, key)}
      restore={restoreDefaultTemplate.bind(null, bound)}
    />
  );
}
