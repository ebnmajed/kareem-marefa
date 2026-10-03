import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { presetsForDocument, type DesignDocument } from "@kareem/designer-runtime";
import { getEffectiveCertificateTemplates } from "@/lib/dal/certificates";
import { listEditorFaces } from "@/lib/dal/fonts";
import { familiesFor, getOrgPreviewName, getTemplateLibrary, type TemplateLibraryData, type TemplatePurpose, type TemplateSummary } from "@/lib/dal/templates";
import { EditorSurface } from "@/components/admin/editor-surface";
import { formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardMedia } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { TagChip } from "@/components/ui/tag-chip";
import { createAndOpen } from "@/app/[locale]/app/admin/templates/actions";
import { NewTemplateForm } from "./new-template-form";
import { OrgTemplateMenu, PlatformTemplateMenu } from "./template-menu";
import { TemplatePreview } from "./template-preview";

// SCR-055 القوالب — rebuilt for wave 23 from `AdminTemplates.dc.html` and `AdminTemplatesCerts.dc.html` (DEC-208:
// deleted first; the kept-behaviour table is `docs/plan/notes/console.md` §4.1). REQ-UIX-108, REQ-ADM-013, REQ-DSG-007,
// REQ-DSG-008, REQ-CRT-015, DEC-236 §1, DEC-238.
//
// The job: an admin finds the default for each certificate kind in one look — the strip names the template issuance
// really picks (DEC-238 §2.3), and when the kind has no default set it names NONE and says «لا قالب افتراضي» (the owner's
// tie guard: issuance would then take a template by version with no tiebreak) — and changes it in one move, ⋯ →
// «اجعله الافتراضي». A platform template is read-only until copied: its card's one action is «انسخ لتعدّل».
//
// Regions in the boards' order: the `h1` with «قالب جديد» · the tabs · قوالب مؤسستك · قوالب المنصة · (certificates) the
// three defaults. ★ ONE KIND per certificate template, three defaults — حضور · تقديم · إنجاز; a template serving several
// kinds is not built (DEC-236 §1). Staff read; only an admin writes (`canManage`, and the policies, 03 §5.9a). A member
// gets the streamed not-found (DEC-134). The page renders nothing of the console frame.

// The format chips the board draws — notation, not copy: «16:9», «A4» are what a print shop or a platform is told in
// every locale (the ISO paper names are `designer-i18n`'s one exemption, and a ratio is not a word). Read from the
// model's presets (`presetsForDocument`), never asserted.
const POSTER_CHIPS: ReadonlyArray<readonly [string, string]> = [
  ["landscape", "16:9"],
  ["a4", "A4"],
  ["a3", "A3"],
  ["story", "9:16"],
];
type Face = { family: string; weight: number; style: string; sha256: string };

/** Every bound TEXT field a template names, outside the brand, as `{label}` — the boards' `{العنوان}`, drawn by the renderer. */
function textBindingsOf(doc: DesignDocument): string[] {
  const out: string[] = [];
  for (const raw of doc.layers) {
    const layer = raw as { text?: { binding?: string }; field?: { binding?: string } };
    const binding = (layer.text?.binding ?? layer.field?.binding ?? "").replace(/^\{\{|\}\}$/g, "").trim();
    if (binding && !binding.startsWith("brand.") && !out.includes(binding)) out.push(binding);
  }
  return out;
}

export async function TemplatesScreen({ locale, purpose, creating }: { locale: string; purpose: TemplatePurpose; creating: boolean }) {
  const [t, tf, data, faces, headerList, orgName, effective] = await Promise.all([
    getTranslations("templates"),
    getTranslations("designer.bindings.field"),
    getTemplateLibrary(locale, purpose),
    listEditorFaces(locale),
    headers(),
    getOrgPreviewName(locale),
    purpose === "certificate" ? getEffectiveCertificateTemplates(locale) : Promise.resolve(null),
  ]);
  if (!data) notFound();

  // Absolute, so a `srcdoc` frame resolves the font URLs the same way in every browser.
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const values: Record<string, string> = { ...data.previewBindings };
  for (const template of [...data.org, ...data.platform]) {
    if (!template.previewDocument) continue;
    for (const binding of textBindingsOf(template.previewDocument)) {
      if (binding in values) continue;
      values[binding] = `{${tf.has(binding) ? tf(binding) : tf("unknown")}}`;
    }
  }
  if (orgName) values["org.name"] = orgName;

  const path = `/app/admin/templates/${purpose === "poster" ? "posters" : "certificates"}`;
  const bdi = (c: React.ReactNode) => <bdi>{c}</bdi>;
  const families = familiesFor(purpose).map((f) => ({ value: f, label: purpose === "certificate" ? t(`card.kind.${f}`) : t(`family.${f}`) }));

  const grid = (templates: TemplateSummary[]) => (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {templates.map((template) => (
        <li key={template.id} className="min-w-0">
          <TemplateCard template={template} data={data} locale={locale} origin={origin} faces={faces} values={values} />
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader
        inlineActions
        title={t("library.title")}
        actions={
          data.canManage ? (
            <ButtonLink href={`${path}?new=1#template-editor`} size="md">
              {t("create.open")}
            </ButtonLink>
          ) : undefined
        }
      />

      {data.canManage && creating ? (
        <EditorSurface id="template-editor" title={t("create.heading")} closeHref={path} closeLabel={t("create.close")}>
          <NewTemplateForm action={createAndOpen.bind(null, locale, purpose)} purpose={purpose} families={families} />
        </EditorSurface>
      ) : null}

      <div className="mt-4">
        <Tabs
          label={t("library.tabsLabel")}
          value={purpose}
          items={[
            { value: "poster", label: t("library.tabPosters"), href: "/app/admin/templates/posters" },
            { value: "certificate", label: t("library.tabCertificates"), href: "/app/admin/templates/certificates" },
          ]}
        >
          <div className="flex flex-col gap-6 pt-4">
            <section aria-labelledby="tpl-org" className="flex flex-col gap-3">
              <h2 id="tpl-org" className="text-label text-fg-muted">
                {t.rich("library.orgHeading", { value: formatNumber(data.org.length), bdi })}
              </h2>
              {data.org.length === 0 ? <p className="text-body-sm text-fg-muted">{t("library.orgEmpty")}</p> : grid(data.org)}
            </section>

            <section aria-labelledby="tpl-platform" id="tpl-platform-section" className="flex flex-col gap-3">
              <h2 id="tpl-platform" className="text-label text-fg-muted">
                {t.rich("library.platformHeading", { value: formatNumber(data.platform.length), bdi })}
              </h2>
              {data.platform.length === 0 ? <p className="text-body-sm text-fg-muted">{t("library.platformEmpty")}</p> : grid(data.platform)}
            </section>

            {effective ? (
              <dl aria-label={t("library.defaultsLabel")} className="flex flex-wrap gap-x-6 gap-y-3 text-body-sm">
                {(["attendance", "presenter", "achievement"] as const).map((kind) => {
                  const picked = effective[kind];
                  return (
                    <div key={kind} className="flex flex-col gap-0.5">
                      <dt className="text-caption font-bold text-fg-muted">{t(`library.defaultFor.${kind}`)}</dt>
                      <dd className="flex flex-wrap items-center gap-1.5 text-fg-heading">
                        {picked.status === "named" ? (
                          <>
                            <bdi>{picked.template.name}</bdi>
                            {picked.template.scope === "platform" ? <span className="text-caption text-fg-muted">· {t("library.platformMark")}</span> : null}
                          </>
                        ) : picked.status === "no_default" ? (
                          // The tie guard: issuance would take a template by version with no tiebreak — name none.
                          <span className="text-fg-muted">{t("library.noDefault")}</span>
                        ) : (
                          t("library.noTemplate")
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : null}
          </div>
        </Tabs>
      </div>
    </>
  );
}

async function TemplateCard({
  template,
  data,
  locale,
  origin,
  faces,
  values,
}: {
  template: TemplateSummary;
  data: TemplateLibraryData;
  locale: string;
  origin: string;
  faces: Face[];
  values: Record<string, string>;
}) {
  const t = await getTranslations("templates");
  const isPlatform = template.scope === "platform";
  const presets = template.previewDocument ? presetsForDocument(template.previewDocument) : [];
  const chips =
    template.purpose === "poster"
      ? POSTER_CHIPS.filter(([preset]) => presets.includes(preset as (typeof presets)[number])).map(([, label]) => label)
      : [t(`card.kind.${template.family}`), ...(template.orientation ? [`A4 ${t(`card.page.${template.orientation}`)}`] : [])];

  return (
    <Card density="grid" className="h-full">
      <div className="p-2.5 pb-0">
        <CardMedia
          aspect={template.purpose === "poster" ? "4/5" : "297/210"}
          placeholderFrom={template.name}
          placeholderTone="dark"
          dimmed={template.retired}
          className="rounded-lg"
        >
          {template.previewDocument ? (
            <TemplatePreview document={template.previewDocument} values={values} faces={faces} origin={origin} title={t("card.previewLabel")} />
          ) : undefined}
        </CardMedia>
      </div>
      <CardBody>
        <div className="flex items-center gap-1.5">
          <h3 className="min-w-0 flex-1 text-label text-fg-heading">
            <bdi>{template.name}</bdi>
          </h3>
          {template.isDefault && !isPlatform ? (
            <Badge size="sm" tone="success">
              {t("card.isDefault")}
            </Badge>
          ) : null}
          {isPlatform ? <Badge size="sm">{t("card.platformBadge")}</Badge> : null}
          {template.draftDocumentId && !isPlatform ? (
            <Badge size="sm" outline>
              {t("card.draft")}
            </Badge>
          ) : null}
          {template.retired ? (
            <Badge size="sm" tone="ended">
              {t("card.retired")}
            </Badge>
          ) : null}
          {data.canManage ? (
            isPlatform ? (
              <PlatformTemplateMenu locale={locale} purpose={template.purpose} templateId={template.id} name={template.name} />
            ) : (
              <OrgTemplateMenu
                locale={locale}
                purpose={template.purpose}
                templateId={template.id}
                name={template.name}
                isDefault={template.isDefault}
                retired={template.retired}
                hasDraft={template.draftDocumentId !== null}
                usageCount={template.usageCount}
              />
            )
          ) : null}
        </div>
        {chips.length ? (
          <ul aria-label={t("card.formats")} className="flex flex-wrap gap-1">
            {chips.map((chip) => (
              <li key={chip}>
                <TagChip label={chip} />
              </li>
            ))}
          </ul>
        ) : null}
      </CardBody>
    </Card>
  );
}
