import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { PLATFORM_NUMERALS } from "@/lib/dal/platform";
import { listPlatformTemplates, listPromotableVersions, type PlatformTemplate } from "@/lib/dal/platform-templates";
import { promoteAction, retireAction, setDefaultAction } from "./actions";
import { PromoteForm } from "./promote-form";

// SCR-083 · /app/platform/templates — REQ-DSG-008, DEC-052.
//
// ★ MANAGED, NOT AUTHORED, and the screen says so rather than leaving an
// operator hunting for an editor that does not exist here. A super admin has
// no org and the designer's editor is org-scoped (SCR-057), so the two ways a
// platform template comes into being are a migration and a promotion.
//
// ★ The A27 baseline is present for every org from creation and depends on no
// org publishing first (DEC-052): those eight rows ship with `0061`, are
// readable by every org and writable by none, and the retire control refuses
// to take a purpose below one default.
//
// No preview, and no document anywhere on this page. `promote_template_to_platform()`
// copies the document server-side and never hands it to the caller, which is
// what keeps "managed" from becoming "reads every org's designs".
//
// Family labels come from the `templates` namespace (`designer`'s): message
// keys are stable by convention, and eight labels duplicated in two languages
// would be eight places for the wording to drift.

function group(list: PlatformTemplate[], purpose: PlatformTemplate["purpose"]) {
  return list.filter((t) => t.purpose === purpose);
}

export default async function PlatformTemplatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [library, candidates, t, tFamily] = await Promise.all([
    listPlatformTemplates(locale),
    listPromotableVersions(locale),
    getTranslations("platform.templates"),
    getTranslations("templates.family"),
  ]);
  const num = (n: number) => formatNumber(n, PLATFORM_NUMERALS);

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-3xl text-body text-fg-muted">{t("intro")}</p>
      <p className="mt-2 max-w-3xl text-body-sm text-fg-muted">{t("baselineNote")}</p>

      <section aria-labelledby="library" className="mt-10">
        <h2 id="library" className="text-h2 text-fg-heading">
          {t("libraryTitle")}
        </h2>

        {library.length === 0 ? (
          <p className="mt-4 text-body text-fg-body">{t("empty")}</p>
        ) : (
          (["poster", "certificate"] as const).map((purpose) => (
            <section key={purpose} aria-labelledby={`purpose-${purpose}`} className="mt-8">
              <h3 id={`purpose-${purpose}`} className="text-h3 text-fg-heading">
                {purpose === "poster" ? t("purposePoster") : t("purposeCertificate")}
              </h3>
              <ul className="mt-3 space-y-3">
                {group(library, purpose).map((tpl) => (
                  <li key={tpl.id} className="rounded-field border border-edge px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="text-label text-fg-heading">
                        <bdi>{tpl.name}</bdi>
                      </p>
                      {/* The A27 baseline names each template after its own
                          family (`0061`), so printing both reads as a stutter
                          — «إعلان إعلان». The label earns its place only when
                          it says something the name does not, which is the
                          case for a promoted template that was renamed. */}
                      {tFamily(tpl.family) === tpl.name ? null : (
                        <p className="text-body-sm text-fg-muted">{tFamily(tpl.family)}</p>
                      )}
                      {tpl.isDefault ? <p className="text-body-sm text-fg-body">{t("isDefault")}</p> : null}
                      {tpl.retiredAt ? <p className="text-body-sm text-fg-muted">{t("retired")}</p> : null}
                    </div>
                    <p className="mt-1 text-body-sm text-fg-muted">{t("versions", { count: tpl.versions, value: num(tpl.versions) })}</p>

                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                      {!tpl.isDefault && !tpl.retiredAt ? (
                        <form action={setDefaultAction.bind(null, locale as Locale, tpl.id)}>
                          <button type="submit" className="text-label text-fg-body underline underline-offset-4 hover:text-fg-heading">
                            {t("setDefault")}
                          </button>
                        </form>
                      ) : null}
                      <form action={retireAction.bind(null, locale as Locale, tpl.id, tpl.retiredAt === null)}>
                        <button type="submit" className="text-label text-fg-muted underline underline-offset-4 hover:text-fg-heading">
                          {tpl.retiredAt ? t("unretire") : t("retire")}
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </section>

      <section aria-labelledby="promote" className="mt-12 border-t border-edge pt-8">
        <h2 id="promote" className="text-h2 text-fg-heading">
          {t("promoteTitle")}
        </h2>
        <p className="mt-3 max-w-3xl text-body text-fg-muted">{t("promoteIntro")}</p>
        <p className="mt-2 max-w-3xl text-body-sm text-fg-muted">{t("promoteNote")}</p>

        {candidates.length === 0 ? (
          <p className="mt-4 text-body text-fg-body">{t("promoteEmpty")}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {candidates.map((c) => (
              <li key={c.versionId} className="rounded-field border border-edge px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-label text-fg-heading">
                    <bdi>{c.name}</bdi>
                  </p>
                  <p className="text-body-sm text-fg-muted">{tFamily(c.family)}</p>
                  <p className="text-body-sm text-fg-muted">
                    {t("org")}
                    {": "}
                    <bdi>{c.orgName}</bdi>
                  </p>
                  <p className="text-body-sm text-fg-muted">{t.rich("version", { value: num(c.version), bdi: (ch) => <bdi>{ch}</bdi> })}</p>
                  {c.alreadyPromoted ? <p className="text-body-sm text-fg-body">{t("alreadyPromoted")}</p> : null}
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer list-none text-label text-fg-body underline underline-offset-4 hover:text-fg-heading">
                    {t("promote")}
                  </summary>
                  <PromoteForm action={promoteAction.bind(null, locale as Locale, c.versionId)} disabled={false} />
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
