"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { PageViewerLabels, PageViewerPage } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { CloseIcon, InfoIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { PageViewer, PageViewerZoom } from "@/components/ui/page-viewer";
import { Panel } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import { formatNumber } from "@/components/sessions/numerals";
import { DownloadControl } from "@/components/viewer/download-control";

// SCR-013, the viewer — written from `Viewer.dc.html` (phone) and `ViewerDesktop.dc.html` (desktop), wave 19
// (REQ-UIX-065, DEC-213, DEC-214). The chrome around `ui/page-viewer`: close, the title, the page count or the
// presenter line, the keys, zoom, download, the footer, and the phone's tap-to-toggle.
//
// ★ A client component because `PageViewerLabels` holds formatter FUNCTIONS (DEC-159, DEC-214 §3): they are built
// here, from the catalogue, and never cross the server boundary. The server page hands over data only.
//
// On black (`bg-void`, DEC-213 §5.82), full-screen at every width — the frame renders nothing of the shell here.
// No motion but the chrome's: a page changes by a cut (N5); the phone's bars slide and fade, and under reduced
// motion they appear and disappear without either (§5.87).

export interface ViewerPresenter {
  displayName: string | null;
  companyName: string | null;
}

export interface ViewerScreenProps {
  locale: string;
  sessionId: string;
  materialId: string;
  title: string;
  /** «PDF» — the kind's label, already translated. */
  kindLabel: string;
  presenters: ViewerPresenter[];
  pages: PageViewerPage[];
  /** `ready` · `pending` · `rendering` · `failed` · `not_applicable`. */
  renderStatus: string;
  /** May this viewer fetch the source? `allow_download`, or a presenter, or staff (DEC-214 §3, N2). */
  canDownload: boolean;
  /** An admin's download is audited, and only theirs (N3). */
  isAdmin: boolean;
  /** Presenters and admins can replace a file that failed (REQ-MAT-008, N4). */
  canReplace: boolean;
  /** The font family the PDF did not embed — shown to presenters and staff only (REQ-MAT-011, N9). */
  substitutionFamily: string | null;
}

// A key's cap — a drawn label, not a control: an inset ring, not a field's border.
const KBD = "rounded-field bg-raised px-2 py-0.5 font-[inherit] ring-1 ring-inset ring-edge";
const BAR = "flex items-center gap-2.5 bg-chrome px-3 py-3.5 lg:h-16 lg:gap-3.5 lg:border-b lg:border-edge lg:px-5 lg:py-0";
const ROUND =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-pill border border-edge bg-raised text-fg-heading focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";
// The phone's bars hide by a slide and a fade (transform and opacity only, a token's duration); never from `lg`.
const SLIDE = "transition-[opacity,transform] duration-(--duration-base) ease-(--ease-play) motion-reduce:transition-none";
const TOP_HIDDEN = "max-lg:pointer-events-none max-lg:-translate-y-full max-lg:opacity-0 motion-reduce:max-lg:translate-y-0";
const BOTTOM_HIDDEN = "max-lg:pointer-events-none max-lg:translate-y-full max-lg:opacity-0 motion-reduce:max-lg:translate-y-0";
const CONTROLS_SLIDE =
  "[&_[data-page-viewer-controls]]:transition-[opacity,transform] [&_[data-page-viewer-controls]]:duration-(--duration-base) [&_[data-page-viewer-controls]]:ease-(--ease-play) motion-reduce:[&_[data-page-viewer-controls]]:transition-none";
const CONTROLS_HIDDEN =
  "max-lg:[&_[data-page-viewer-controls]]:pointer-events-none max-lg:[&_[data-page-viewer-controls]]:translate-y-full max-lg:[&_[data-page-viewer-controls]]:opacity-0 motion-reduce:max-lg:[&_[data-page-viewer-controls]]:translate-y-0";

export function ViewerScreen(props: ViewerScreenProps) {
  const { locale, sessionId, materialId, title, kindLabel, presenters, pages, renderStatus, canDownload, isAdmin, canReplace, substitutionFamily } = props;
  const t = useTranslations("materials");
  const router = useRouter();
  const dir: "rtl" | "ltr" = locale === "en" ? "ltr" : "rtl";
  const total = pages.length;

  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(0);
  const [hidden, setHidden] = useState(false);
  const show = useCallback(() => setHidden(false), []);
  const toggle = useCallback(() => setHidden((h) => !h), []);

  const bdi = (chunks: ReactNode) => <bdi>{chunks}</bdi>;

  const labels = useMemo<PageViewerLabels>(
    () => ({
      previous: t("viewer.previous"),
      next: t("viewer.next"),
      scrubber: t("viewer.scrubberLabel"),
      rail: t("viewer.thumbnailsLabel"),
      thumbnail: (n) => t.markup("viewer.thumbnailLabel", { number: formatNumber(n), bdi: (c) => c }),
      pageOf: (c, n) => t.rich("viewer.pageOf", { current: formatNumber(c), total: formatNumber(n), bdi: (chunks) => <bdi>{chunks}</bdi> }),
      pageOfText: (c, n) => t.markup("viewer.pageOf", { current: formatNumber(c), total: formatNumber(n), bdi: (chunks) => chunks }),
      position: (c, n) => t.rich("viewer.position", { current: formatNumber(c), total: formatNumber(n), bdi: (chunks) => <bdi>{chunks}</bdi> }),
      zoomIn: t("viewer.zoomIn"),
      zoomOut: t("viewer.zoomOut"),
      stage: t("viewer.stageLabel"),
      noPages: t("viewer.states.noPages"),
    }),
    [t],
  );

  const ready = renderStatus === "ready" && total > 0;
  const preparing = renderStatus === "pending" || renderStatus === "rendering";
  const failed = renderStatus === "failed";

  // Every accepted presenter, joined — never only the first (contract 8, DEC-214 §3 N8).
  const presenterLine = presenters.map((p, i) => (
    <span key={i}>
      {i > 0 ? ` ${t("viewer.presenterAnd")}` : null}
      {p.companyName ? t.rich("viewer.presenter", { name: p.displayName ?? "", company: p.companyName, bdi }) : <bdi>{p.displayName}</bdi>}
    </span>
  ));

  const close = (
    <Link href={`/app/sessions/${sessionId}`} quiet aria-label={t("viewer.close")} className={ROUND}>
      <CloseIcon className="text-[1.125rem]" />
    </Link>
  );

  return (
    <div dir={dir} onFocusCapture={show} className={`flex h-dvh flex-col overflow-hidden bg-void text-fg-heading ${CONTROLS_SLIDE} ${hidden ? CONTROLS_HIDDEN : ""}`}>
      {/* ── The chrome bar: close · the title and its second line · (the keys, from lg) · zoom · download ── */}
      <header className={`${BAR} ${SLIDE} ${hidden ? TOP_HIDDEN : ""} relative z-10`}>
        {close}
        <div className="min-w-0 flex-1 leading-snug">
          {/* The title wraps — no ellipsis, no `overflow: hidden` on a text line (N1, `10` §2). */}
          <h1 className="text-[0.875rem] font-bold text-fg-heading lg:text-[0.9375rem]">{title}</h1>
          {ready ? (
            <p data-testid="page-indicator" className="text-caption text-fg-muted lg:hidden">
              {labels.pageOf(page, total)}
            </p>
          ) : null}
          <p className="hidden text-caption text-fg-muted lg:block">
            {presenterLine.length > 0 ? <>{presenterLine} · </> : null}
            {ready ? <>{t("viewer.pageCount", { count: total, value: formatNumber(total) })} · </> : null}
            {kindLabel}
          </p>
        </div>
        {ready ? (
          <ul aria-label={t("viewer.keysLabel")} className="hidden items-center gap-2 text-caption text-fg-muted lg:flex">
            <li className="flex items-center gap-1.5">
              <kbd className={KBD}>{dir === "rtl" ? "←" : "→"}</kbd>
              {t("viewer.keys.next")}
            </li>
            <li className="flex items-center gap-1.5">
              <kbd className={KBD}>{dir === "rtl" ? "→" : "←"}</kbd>
              {t("viewer.keys.previous")}
            </li>
            <li>
              <kbd className={KBD}>Home</kbd>
            </li>
            <li>
              <kbd className={KBD}>End</kbd>
            </li>
          </ul>
        ) : null}
        {ready ? <PageViewerZoom zoom={zoom} onZoomChange={setZoom} labels={labels} className="shrink-0" /> : null}
        {canDownload ? <DownloadControl locale={locale} materialId={materialId} audited={isAdmin} /> : null}
      </header>

      {/* The font-substitution notice — the presenter and staff, whom it asks to act (REQ-MAT-011, N9). */}
      {substitutionFamily ? (
        <Panel tone="info" className={`flex items-start gap-2 rounded-none border-x-0 p-3 ${SLIDE} ${hidden ? TOP_HIDDEN : ""}`}>
          <InfoIcon aria-hidden className="mt-0.5 shrink-0" />
          <p className="text-body-sm text-fg-heading">{t.rich("list.substitutionWarning.body", { family: substitutionFamily, bdi })}</p>
        </Panel>
      ) : null}

      <div className="min-h-0 flex-1">
        {ready ? (
          <PageViewer
            pages={pages}
            dir={dir}
            title={title}
            labels={labels}
            page={page}
            onPageChange={setPage}
            zoom={zoom}
            onZoomChange={setZoom}
            showZoom={false}
            onStageTap={toggle}
            onKeyActivity={show}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            {preparing ? (
              <>
                <p className="text-body text-fg-heading">{t("list.renderStatus.rendering")}</p>
                <Progress label={t("list.renderStatus.rendering")} className="w-48" />
              </>
            ) : failed ? (
              <Panel tone="error" className="flex max-w-md flex-col items-center gap-3">
                <p className="text-body text-fg-heading">{canReplace ? t("viewer.states.failed") : t("viewer.states.failedShort")}</p>
                {/* «أعد المحاولة» reloads (N4): a file that failed may have been replaced since. */}
                <Button type="button" variant="secondary" size="sm" onClick={() => router.refresh()}>
                  {t("viewer.states.retry")}
                </Button>
              </Panel>
            ) : (
              <p className="text-body text-fg-muted">{t("viewer.states.noPages")}</p>
            )}
          </div>
        )}
      </div>

      {ready ? (
        <>
          {/* The phone's hint line is copy (N7), and leaves with the bars. */}
          <p className={`bg-chrome px-3 pb-4.5 text-center text-caption text-fg-muted lg:hidden ${SLIDE} ${hidden ? BOTTOM_HIDDEN : ""}`}>{t("viewer.gestureHint")}</p>
          <footer className="hidden h-11 items-center justify-center gap-4 border-t border-edge bg-chrome text-caption text-fg-muted lg:flex">
            <span>{labels.pageOf(page, total)}</span>
            <span aria-hidden="true">·</span>
            <span>{t("viewer.sourceNote")}</span>
          </footer>
        </>
      ) : null}
    </div>
  );
}
