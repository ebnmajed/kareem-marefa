import { getTranslations } from "next-intl/server";
import type { TemplateLibraryData, TemplateSummary } from "@/lib/dal/templates";
import { formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { Card, CardActions, CardBody, CardMedia } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LockIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { DuplicateTemplateDialog, OrgTemplateActions } from "@/components/designer/template-actions";
import { TemplatePreview } from "@/components/designer/template-preview";

// SCR-055 · SCR-056 — the two libraries, one component, on the M9 system.
// REQ-ADM-013, REQ-DSG-004, REQ-DSG-007, REQ-DSG-008, REQ-DSG-024,
// REQ-DSG-026, `16` §10.3, DEC-148.
//
// D54's «one engine, two template libraries» is the reason this is one file:
// the two libraries differ by `purpose`, by which families the database will
// accept, and — since DEC-148 — by a certificate being a landscape or a
// portrait COMPOSITION. Nothing else.
//
// `16` §10.3's shape: a card grid with each template drawn by the renderer in
// the scheme it renders in, its state («منشور» / «مسودة»), its use, and the
// platform library as a clearly separate, read-only-until-copied section. No
// artboard draws this screen; the card media follows `PosterFlow`'s and the
// status line `CertBuilder`'s chip (my note, W8.c).
//
// A platform card carries no write control at all — not a disabled one. The
// policy (03 §5.9a) makes an org admin's UPDATE match no row, so the action
// that actually exists is shown: copy it.

export interface TemplateLibraryProps {
  data: TemplateLibraryData;
  locale: string;
  origin: string;
  faces: Array<{ family: string; weight: number; style: string; sha256: string }>;
}

export async function TemplateLibrary({ data, locale, origin, faces }: TemplateLibraryProps) {
  const t = await getTranslations("templates");

  const grid = (templates: TemplateSummary[]) => (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {templates.map((template) => (
        <li key={template.id} className="min-w-0">
          <TemplateCard template={template} data={data} locale={locale} origin={origin} faces={faces} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="tpl-platform" id="tpl-platform-section" className="flex flex-col gap-4">
        <SectionHeader id="tpl-platform" title={t("library.platformHeading")} description={t("library.platformIntro")} count={data.platform.length} />
        {data.platform.length === 0 ? (
          <Panel>
            <p className="text-body-sm text-fg-muted">{t("library.platformEmpty")}</p>
          </Panel>
        ) : (
          grid(data.platform)
        )}
      </section>

      <section aria-labelledby="tpl-org" className="flex flex-col gap-4 border-t border-edge pt-8">
        <SectionHeader id="tpl-org" title={t("library.orgHeading")} description={t("library.orgIntro")} count={data.org.length} />
        {data.org.length === 0 ? (
          <EmptyState
            size="sm"
            title={t("library.orgEmptyTitle")}
            description={t("library.orgEmptyDescription")}
            action={{
              label: t("library.orgEmptyAction"),
              href: `/app/admin/templates/${data.purpose === "poster" ? "posters" : "certificates"}#tpl-platform-section`,
            }}
          />
        ) : (
          grid(data.org)
        )}
      </section>

      {data.org.length || data.platform.length ? (
        <p className="text-body-sm text-fg-muted">
          <LockIcon className="me-1 inline-block align-[-0.125em]" />
          {t("card.lockedHint")}
        </p>
      ) : null}

      {data.canManage ? (
        <p className="text-body-sm text-fg-muted xl:hidden">{t("library.phoneEditNote")}</p>
      ) : (
        <Panel tone="info">
          <p role="status" className="text-body-sm text-fg-body">
            {t("library.moderatorNotice")}
          </p>
        </Panel>
      )}

      {/* DEC-003 / REQ-DSG-026, stated on the screen rather than in a style
          guide nobody opens while designing. */}
      <Panel tone="info">
        <p className="text-body-sm text-fg-body">{t("brandNote")}</p>
      </Panel>
    </div>
  );
}

async function TemplateCard({
  template,
  data,
  locale,
  origin,
  faces,
}: {
  template: TemplateSummary;
  data: TemplateLibraryData;
  locale: string;
  origin: string;
  faces: TemplateLibraryProps["faces"];
}) {
  const t = await getTranslations("templates");
  const isPlatform = template.scope === "platform";
  const aspect = template.purpose === "poster" ? "4/5" : template.orientation === "portrait" ? "210/297" : "297/210";

  return (
    <Card density="grid" className="h-full">
      <CardMedia
        aspect={aspect}
        placeholderFrom={template.name}
        placeholderTone="dark"
        dimmed={template.retired}
        overlay={
          template.isDefault ? (
            <Badge size="sm" tone="success">
              {t("card.isDefault")}
            </Badge>
          ) : undefined
        }
      >
        {template.previewDocument ? (
          <TemplatePreview document={template.previewDocument} bindings={data.previewBindings} faces={faces} origin={origin} title={t("card.previewLabel")} />
        ) : undefined}
      </CardMedia>

      <CardBody>
        <h3 className="text-label text-fg-heading">
          <bdi>{template.name}</bdi>
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {isPlatform ? (
            <Badge size="sm" tone="info">
              {t("card.platformBadge")}
            </Badge>
          ) : null}
          {/* The family, unless the name already says it — a baseline row is
              called «جلسة», and «جلسة · جلسة» says nothing twice. */}
          {template.name.startsWith(t(`family.${template.family}`)) ? null : (
            <Badge size="sm" outline>
              {t(`family.${template.family}`)}
            </Badge>
          )}
          {template.orientation ? (
            <Badge size="sm" outline>
              {t(`card.orientation.${template.orientation}`)}
            </Badge>
          ) : null}
          {template.draftDocumentId ? (
            <Badge size="sm" outline tone="neutral">
              {t("card.draft")}
            </Badge>
          ) : null}
          {template.retired ? (
            <Badge size="sm" tone="ended">
              {t("card.retired")}
            </Badge>
          ) : null}
        </div>
        <p className="text-caption text-fg-muted">
          {template.latestVersion === null
            ? t("card.noVersion")
            : t.rich("card.version", { value: formatNumber(template.latestVersion), bdi: (c) => <bdi>{c}</bdi> })}
          {" · "}
          {t("card.lockedRegions", { count: template.lockedRegionCount, value: formatNumber(template.lockedRegionCount) })}
          {data.canManage ? (
            <>
              {" · "}
              {t("card.usage", { count: template.usageCount, value: formatNumber(template.usageCount) })}
            </>
          ) : null}
        </p>
      </CardBody>

      {data.canManage ? (
        <CardActions className="flex-wrap px-4 pb-4">
          {isPlatform ? (
            <DuplicateTemplateDialog locale={locale} purpose={template.purpose} templateId={template.id} name={template.name} />
          ) : (
            <OrgTemplateActions
              locale={locale}
              purpose={template.purpose}
              templateId={template.id}
              name={template.name}
              isDefault={template.isDefault}
              retired={template.retired}
              hasDraft={template.draftDocumentId !== null}
            />
          )}
        </CardActions>
      ) : null}
    </Card>
  );
}
