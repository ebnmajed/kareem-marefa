import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

// SCR-005 · /legal/privacy — REQ-NFR-015, 12 §5 and §6, OQ-026.
//
// ★ PUBLIC, and the document is the requirement. `REQ-NFR-015` asks that PDPL
// obligations be STATED "without assuming a hosting region", and `12` §6.1 is
// explicit about what that means in practice: the current region is recorded
// as a FACT TO REVISIT, named with its decision-maker, and this page does not
// conclude compliance in either direction. A privacy page that quietly asserted
// "we comply" would be the platform making a legal determination it is not
// entitled to make.
//
// The erasure section says no to self-service deletion and says why, rather
// than offering a "delete account" that means something else (12 §5.4). A
// person reading their rights deserves the reason, not the mechanism.

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.privacy" });
  return { title: t("title"), description: t("intro") };
}

// The date the text last changed, not a render timestamp: a policy that says
// "updated today" every day tells a reader nothing.
const UPDATED = "2026-09-14";

export default async function PrivacyPolicyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.privacy");
  const updated = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { dateStyle: "long", timeZone: "Asia/Riyadh" }).format(
    new Date(UPDATED),
  );

  const section = (key: string, body: string[]) => (
    <section key={key} aria-labelledby={key} className="mt-10">
      <h2 id={key} className="text-h2 text-fg-heading">
        {t(`${key}Title`)}
      </h2>
      {body.map((k) => (
        <p key={k} className="mt-3 text-body text-fg-body">
          {t(k)}
        </p>
      ))}
    </section>
  );

  const list = (key: string, intro: string, items: string[]) => (
    <section aria-labelledby={key} className="mt-10">
      <h2 id={key} className="text-h2 text-fg-heading">
        {t(`${key}Title`)}
      </h2>
      <p className="mt-3 text-body text-fg-body">{t(intro)}</p>
      <ul className="mt-4 space-y-2">
        {items.map((k) => (
          <li key={k} className="ps-5 text-body text-fg-body [text-indent:-1.25rem]">
            {"— "}
            {t(k)}
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <article>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-4 text-body text-fg-muted">{t("intro")}</p>
      <p className="mt-2 text-body-sm text-fg-muted">
        {t("updated")}
        {": "}
        <bdi>{updated}</bdi>
      </p>

      {section("basis", ["basisBody"])}
      {list("collect", "collectIntro", [
        "collectIdentity",
        "collectProfile",
        "collectActivity",
        "collectCalendar",
        "collectAudit",
      ])}
      {section("notCollect", ["notCollectBody"])}

      <section aria-labelledby="visibility" className="mt-10">
        <h2 id="visibility" className="text-h2 text-fg-heading">
          {t("visibilityTitle")}
        </h2>
        <ul className="mt-4 space-y-2">
          {["visibilityRatings", "visibilityAbsence", "visibilityAttendance", "visibilityCalendar"].map((k) => (
            <li key={k} className="ps-5 text-body text-fg-body [text-indent:-1.25rem]">
              {"— "}
              {t(k)}
            </li>
          ))}
        </ul>
      </section>

      {list("retention", "retentionIntro", [
        "retentionAudit",
        "retentionCheckin",
        "retentionEmail",
        "retentionLedger",
        "retentionContent",
        "retentionCalendar",
        "retentionExport",
      ])}

      <section aria-labelledby="rights" className="mt-10">
        <h2 id="rights" className="text-h2 text-fg-heading">
          {t("rightsTitle")}
        </h2>
        <ul className="mt-4 space-y-2">
          {["rightsAccess", "rightsCorrect", "rightsErase"].map((k) => (
            <li key={k} className="ps-5 text-body text-fg-body [text-indent:-1.25rem]">
              {"— "}
              {t(k)}
            </li>
          ))}
        </ul>
        {/* The honest paragraph, not a footnote: it is the one place the
            product says no to something a reader may have come here for. */}
        <p className="mt-4 text-body text-fg-body">{t("rightsEraseHonest")}</p>
      </section>

      {section("security", ["securityBody"])}
      {section("breach", ["breachBody"])}
      {section("pdpl", ["pdplBody"])}
      {/* ★ OQ-026: a fact to revisit, never a compliance conclusion. */}
      {section("transfer", ["transferBody", "transferHonest"])}
      {section("contact", ["contactBody"])}
    </article>
  );
}
