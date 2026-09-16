import { getTranslations } from "next-intl/server";
import type { DesignerSlotProps } from "@/components/posters/slots";
import { getPosterPicker, MIN_UPLOADED_POSTER_SHORT_SIDE, type PosterMode } from "@/lib/dal/posters";
import { CustomiseButton, PosterUpload } from "@/components/posters/picker-controls";
import { SessionPoster } from "@/components/posters/session-poster";
import { formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardActions, CardBody } from "@/components/ui/card";
import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";

// The `PosterPicker` slot on SCR-043 — REQ-DSG-002, REQ-DSG-003, REQ-DSG-020,
// REQ-UIX-013, DEC-012, `16` §10.3, DEC-148.
//
// Three cards for DEC-012's three paths, each saying BEFORE the choice what
// it costs, the current one marked. Props unchanged (TEAM.md §2): the slot
// reads its own data, renders no heading of its own — the schedule page owns
// «الملصق» and its landmark — and its cards' titles sit under that heading.
//
// ★ THE TWO ONE-WAY ACTS ARE CONFIRMED BY NAME. «خصّص» detaches before the
// studio opens (REQ-DSG-003: the detach is the decision, so it is the act the
// dialog confirms), and an upload over an existing poster says what it
// replaces. Neither dialog promises anything about the brand beyond the truth
// (DEC-148 q3).
//
// ★ No card offers a way back to automatic, because there is none: a
// re-attach is the overwrite DEC-012 exists to prevent, with a confirm on it.
// The automatic card says so when the poster is already detached.
//
// Staff read it; an admin acts on it (`detach_poster()` and the asset routes
// check `is_org_admin()` themselves).

export async function PosterPicker({ sessionId, locale }: DesignerSlotProps) {
  const [t, data] = await Promise.all([getTranslations("designer.poster"), getPosterPicker(locale, sessionId)]);
  if (!data) return null;

  const { poster, canEdit, sessionTitle } = data;
  const mode: PosterMode | null = poster?.mode ?? null;
  const detached = poster?.binding === "detached";
  const studio = poster?.documentId ? `/app/admin/designer/${poster.documentId}` : null;

  const current = (path: PosterMode) =>
    mode === path ? (
      <Badge size="sm" tone="success">
        {t("picker.current")}
      </Badge>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-fg-muted">{t("picker.intro")}</p>

      {/* DEC-012's asymmetry made visible: details moved under a detached
          poster, and nothing overwrote it. */}
      {poster?.staleSince ? (
        <Panel tone="info">
          <p role="status" className="text-body-sm text-fg-heading">
            {t("stale")}
          </p>
          <p className="mt-1 text-body-sm text-fg-body">{t("staleWhy")}</p>
          {canEdit && studio ? (
            <Link href={studio} className={buttonClass("secondary", "sm", "mt-3")}>
              {t("picker.staleAction")}
            </Link>
          ) : null}
        </Panel>
      ) : null}

      <div className="max-w-sm">
        <SessionPoster sessionId={sessionId} locale={locale} variant="square" />
      </div>

      {!canEdit ? <p className="text-body-sm text-fg-muted">{t("picker.readOnly")}</p> : null}

      <ul className="flex flex-col gap-3">
        <li>
          <Card>
            <CardBody>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-label text-fg-heading">{t("picker.auto")}</h3>
                {current("auto")}
              </div>
              <p className="text-body-sm text-fg-muted">{t("picker.autoHint")}</p>
              {detached ? <p className="text-body-sm text-fg-body">{t("picker.autoDetached")}</p> : null}
            </CardBody>
          </Card>
        </li>

        <li>
          <Card>
            <CardBody>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-label text-fg-heading">{t("picker.customise")}</h3>
                {current("customised")}
              </div>
              {/* ★ The detach is one way, and it is said BEFORE the click. */}
              <p className="text-body-sm text-fg-muted">{t("picker.customiseHint")}</p>
            </CardBody>
            {canEdit && poster ? (
              <CardActions className="px-4 pb-4">
                {!detached ? (
                  <CustomiseButton sessionId={sessionId} sessionTitle={sessionTitle} variant="secondary" />
                ) : studio ? (
                  <Link href={studio} className={buttonClass("secondary", "md")}>
                    {t("picker.openDesigner")}
                  </Link>
                ) : null}
              </CardActions>
            ) : null}
          </Card>
        </li>

        <li>
          <Card>
            <CardBody>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-label text-fg-heading">{t("picker.upload")}</h3>
                {current("uploaded")}
              </div>
              {canEdit ? (
                <PosterUpload
                  sessionId={sessionId}
                  sessionTitle={sessionTitle}
                  currentMode={mode}
                  limitMb={data.limitMb}
                  minimum={MIN_UPLOADED_POSTER_SHORT_SIDE}
                />
              ) : (
                <p className="text-body-sm text-fg-muted">
                  {t.rich("picker.uploadHint", { minimum: formatNumber(MIN_UPLOADED_POSTER_SHORT_SIDE), bdi: (c) => <bdi>{c}</bdi> })}
                </p>
              )}
            </CardBody>
          </Card>
        </li>
      </ul>
    </div>
  );
}
