import { getTranslations } from "next-intl/server";
import type { TemplateLibraryData, TemplateSummary } from "@/lib/dal/templates";
import { familiesFor } from "@/lib/dal/templates";
import { formatNumber, type NumeralSystem } from "@/components/sessions/numerals";
import { createTemplate, duplicateFromPlatform, editTemplate, makeDefault, publishVersion, toggleRetired } from "@/app/[locale]/app/admin/templates/actions";

// SCR-055 · SCR-056 — the two libraries, one component.
//
// D54's «one engine, two template libraries» is the reason this is one file:
// a poster library and a certificate library differ by `purpose` and by which
// families the database will accept, and by nothing else. A second component
// would be a second place for the platform/org rule to drift.
//
// A platform template's card carries no write control at all — not a disabled
// one. The policy (03 §5.9a) makes an org admin's UPDATE match no row, so a
// disabled button would be telling the truth about a rule the user can
// already see; a duplicate button is the action that actually exists.

const field = "mt-1 block h-11 w-full rounded-field border border-edge-strong bg-canvas px-3 text-body text-fg-heading";
const action = "h-11 rounded-field border border-edge-strong px-4 text-body-sm text-fg-heading";

export async function TemplateLibrary({ data, numerals }: { data: TemplateLibraryData; numerals: NumeralSystem }) {
  const t = await getTranslations("templates");

  return (
    <div className="flex flex-col gap-10">
      <p className="text-body text-fg-muted">{t("library.intro")}</p>

      <section aria-labelledby="tpl-platform" className="flex flex-col gap-4">
        <h2 id="tpl-platform" className="text-h2 text-fg-heading">
          {t("library.platformHeading")}
        </h2>
        <p className="text-body-sm text-fg-muted">{t("library.platformIntro")}</p>
        {data.platform.length === 0 ? (
          <p className="text-body-sm text-fg-muted">{t("library.platformEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.platform.map((template) => (
              <li key={template.id}>
                <Card template={template} canManage={data.canManage} numerals={numerals} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="tpl-org" className="flex flex-col gap-4">
        <h2 id="tpl-org" className="text-h2 text-fg-heading">
          {t("library.orgHeading")}
        </h2>
        <p className="text-body-sm text-fg-muted">{t("library.orgIntro")}</p>
        {data.org.length === 0 ? (
          <p className="text-body-sm text-fg-muted">{t("library.orgEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.org.map((template) => (
              <li key={template.id}>
                <Card template={template} canManage={data.canManage} numerals={numerals} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.canManage ? (
        <section aria-labelledby="tpl-create" className="flex flex-col gap-4">
          <h2 id="tpl-create" className="text-h2 text-fg-heading">
            {t("create.heading")}
          </h2>
          <form action={createTemplate} className="flex max-w-xl flex-col gap-3">
            <input type="hidden" name="purpose" value={data.purpose} />
            <label className="block">
              <span className="text-body-sm text-fg-body">{t("create.name")}</span>
              <input type="text" name="name" required maxLength={120} className={field} />
            </label>
            <label className="block">
              <span className="text-body-sm text-fg-body">{t("create.family")}</span>
              <select name="family" className={field} defaultValue={familiesFor(data.purpose)[0]}>
                {familiesFor(data.purpose).map((family) => (
                  <option key={family} value={family}>
                    {t(`family.${family}`)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={`${action} self-start`}>
              {t("create.submit")}
            </button>
          </form>
        </section>
      ) : (
        <p role="status" className="text-body-sm text-fg-muted">
          {t("library.moderatorNotice")}
        </p>
      )}

      {/* DEC-003 / REQ-DSG-026, stated on the screen rather than in a style
          guide nobody opens while designing. */}
      <p className="rounded-field border border-edge bg-silver-100 p-4 text-body-sm text-fg-body">{t("brandNote")}</p>
    </div>
  );
}

async function Card({ template, canManage, numerals }: { template: TemplateSummary; canManage: boolean; numerals: NumeralSystem }) {
  const t = await getTranslations("templates");
  const isPlatform = template.scope === "platform";

  return (
    <article className="rounded-card border border-edge p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-body font-medium text-fg-heading">
          <bdi>{template.name}</bdi>
        </h3>
        <p className="text-body-sm text-fg-muted">{t(`family.${template.family}`)}</p>
        {template.isDefault ? <p className="text-body-sm text-fg-heading">{t("card.isDefault")}</p> : null}
        {template.retired ? <p className="text-body-sm text-fg-muted">{t("card.retired")}</p> : null}
        {isPlatform ? <p className="text-body-sm text-fg-muted">{t("card.readOnly")}</p> : null}
      </div>

      <p className="mt-2 text-body-sm text-fg-muted">
        {template.latestVersion === null
          ? t("card.noVersion")
          : t.rich("card.version", { value: formatNumber(template.latestVersion, numerals), bdi: (c) => <bdi>{c}</bdi> })}
        {" · "}
        {t("card.versionCount", { count: template.versionCount, value: formatNumber(template.versionCount, numerals) })}
        {" · "}
        {t("card.lockedRegions", { count: template.lockedRegionCount, value: formatNumber(template.lockedRegionCount, numerals) })}
      </p>

      {template.lockedRegionCount > 0 ? <p className="mt-2 text-body-sm text-fg-muted">{t("card.lockedHint")}</p> : null}
      {template.isDefault ? <p className="mt-2 text-body-sm text-fg-muted">{t("card.defaultHint")}</p> : null}

      {canManage ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {isPlatform ? (
            // REQ-DSG-008: the copy is independent, so a later platform
            // change never reaches it.
            <form action={duplicateFromPlatform} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="purpose" value={template.purpose} />
              <input type="hidden" name="templateId" value={template.id} />
              <label className="block">
                <span className="text-body-sm text-fg-body">{t("create.duplicateName")}</span>
                <input type="text" name="name" required maxLength={120} defaultValue={template.name} className={field} />
              </label>
              <button type="submit" className={action}>
                {t("card.duplicate")}
              </button>
            </form>
          ) : (
            <>
              <form action={editTemplate}>
                <input type="hidden" name="purpose" value={template.purpose} />
                <input type="hidden" name="templateId" value={template.id} />
                <button type="submit" className={action}>
                  {t("card.edit")}
                </button>
              </form>
              {template.draftDocumentId ? (
                <form action={publishVersion}>
                  <input type="hidden" name="purpose" value={template.purpose} />
                  <input type="hidden" name="templateId" value={template.id} />
                  <button type="submit" className={action}>
                    {t("card.publish")}
                  </button>
                </form>
              ) : null}
              {template.isDefault || template.retired ? null : (
                <form action={makeDefault}>
                  <input type="hidden" name="purpose" value={template.purpose} />
                  <input type="hidden" name="templateId" value={template.id} />
                  <button type="submit" className={action}>
                    {t("card.setDefault")}
                  </button>
                </form>
              )}
              <form action={toggleRetired}>
                <input type="hidden" name="purpose" value={template.purpose} />
                <input type="hidden" name="templateId" value={template.id} />
                <input type="hidden" name="retired" value={template.retired ? "0" : "1"} />
                <button type="submit" className={action}>
                  {template.retired ? t("card.restore") : t("card.retire")}
                </button>
              </form>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}
