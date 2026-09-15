import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

// SCR-005 · /legal/terms — REQ-NFR-015. Public, like the privacy policy.
//
// Short on purpose. What these terms govern is narrow — an internal platform
// for knowledge sessions among the employees of participating orgs — and terms
// longer than what they govern are terms nobody reads, which is the same as
// having none.

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.terms" });
  return { title: t("title"), description: t("intro") };
}

const UPDATED = "2026-09-14";

const SECTIONS = ["access", "conduct", "content", "uploads", "certificates", "availability", "changes"] as const;

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.terms");
  const updated = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { dateStyle: "long", timeZone: "Asia/Riyadh" }).format(
    new Date(UPDATED),
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

      {SECTIONS.map((key) => (
        <section key={key} aria-labelledby={key} className="mt-10">
          <h2 id={key} className="text-h2 text-fg-heading">
            {t(`${key}Title`)}
          </h2>
          <p className="mt-3 text-body text-fg-body">{t(`${key}Body`)}</p>
        </section>
      ))}
    </article>
  );
}
