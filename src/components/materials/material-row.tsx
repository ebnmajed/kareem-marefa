import type { getTranslations } from "next-intl/server";
import { AudioRow } from "@/components/materials/audio-row";
import { rescopeMaterialAction } from "@/components/materials/actions";
import { phaseLabelKey } from "@/components/materials/phase-label";
import { RescopeChip, type RescopeOption } from "@/components/materials/rescope-chip";
import { SettingsForm } from "@/components/materials/settings-form";
import { EditOnly, ReadOnly } from "@/components/sessions/edit-mode";
import { Badge } from "@/components/ui/badge";
import { ChevronIcon, DownloadIcon, ImageIcon, LinkIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import type { MaterialSummary } from "@/lib/dal/materials";

// One material on the event page — `Event.dc.html:95`, `EventDone.dc.html:71-73`, REQ-MAT-002 … REQ-MAT-011.
// Written from the artboard (DEC-208): a type tile, the title, one line of what it is and when, and the whole
// row the way in — to the viewer for a PDF, out of the platform for a link, a player for audio.
//
// ★ The phase words are the item's own scope's — «قبل الجلسة», «بعد اليوم» (REQ-MAT-006 as amended, DEC-121).
// ★ A download glyph only where download is allowed (DEC-209); the download itself is the viewer's, where an
// admin's is audited (REQ-MAT-005). Nothing here hands out a file.
// ★ Audio plays only when the server signed it for this viewer (`playbackUrl`); a member of a recording with
// download off gets none, and the row says so (DEC-209).
// ★ Below the row, for a presenter or staff only: its render state, the font warning, the settings and — at
// more than one day — the re-scope chip. A plain member sees the row alone. ★ The font warning, the re-scope chip
// and the settings are drawn in the event page's edit mode alone (`sessions/edit-mode.tsx`); the render state stays
// in the row, where a member who may see the item sees it too.

type T = Awaited<ReturnType<typeof getTranslations>>;

export interface MaterialRowProps {
  m: MaterialSummary;
  sessionId: string;
  locale: string;
  canManage: boolean;
  /** Present at more than one day, for a manager. */
  scope: { currentLabel: string; options: RescopeOption[] } | null;
  /** A signed stream for an audio material, or null. */
  playbackUrl: string | null;
  t: T;
}

const ROW = "flex min-h-16 items-center gap-3 rounded-tile border border-edge bg-surface px-3.5 py-3";
const TILE = "inline-flex size-10 shrink-0 items-center justify-center rounded-field bg-raised text-caption font-extrabold text-accent";

function Head({ tile, title, meta, trailing }: { tile: React.ReactNode; title: string; meta: string; trailing?: React.ReactNode }) {
  return (
    <>
      <span aria-hidden className={TILE}>
        {tile}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="text-label font-bold text-fg-heading">
          <bdi>{title}</bdi>
        </span>
        <span className="text-caption text-fg-muted">{meta}</span>
      </span>
      {trailing}
    </>
  );
}

export function MaterialRow({ m, sessionId, locale, canManage, scope, playbackUrl, t }: MaterialRowProps) {
  // DEC-266 (the owner's ruling): a member never downloads a material's original file — the viewer and the player
  // are theirs, the file is presenters' and staff's. `allow_download` no longer reaches a member's row.
  // ★ Edit mode (the owner's ruling, `sessions/edit-mode.tsx`): that the file can be downloaded is a manager's fact,
  // so a manager's row says it in edit mode and says what a member's says in read mode.
  const managerDownload = canManage && m.allowDownload;
  if (managerDownload) {
    return (
      <>
        <EditOnly>
          <MaterialRowBody m={m} sessionId={sessionId} locale={locale} canManage={canManage} scope={scope} playbackUrl={playbackUrl} t={t} downloadable />
        </EditOnly>
        <ReadOnly>
          <MaterialRowBody m={m} sessionId={sessionId} locale={locale} canManage={canManage} scope={scope} playbackUrl={playbackUrl} t={t} downloadable={false} />
        </ReadOnly>
      </>
    );
  }
  return <MaterialRowBody m={m} sessionId={sessionId} locale={locale} canManage={canManage} scope={scope} playbackUrl={playbackUrl} t={t} downloadable={false} />;
}

function MaterialRowBody({ m, sessionId, locale, canManage, scope, playbackUrl, t, downloadable }: MaterialRowProps & { downloadable: boolean }) {
  const phase = t(phaseLabelKey(m.phase, m.sessionDayId));
  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(" · ");
  const ready = m.renderStatus === "ready";

  let row: React.ReactNode;
  if (m.kind === "pdf" && ready) {
    row = (
      <Link href={`/app/sessions/${sessionId}/materials/${m.id}`} className={`${ROW} hover:bg-hover`}>
        <Head
          tile={t("kind.pdf")}
          title={m.title}
          meta={join(phase, downloadable ? t("row.viewerAndDownload") : t("row.viewer"))}
          trailing={downloadable ? <DownloadIcon aria-hidden className="shrink-0 text-lg text-fg-muted" /> : <ChevronIcon aria-hidden direction="forward" className="shrink-0 text-fg-muted" />}
        />
      </Link>
    );
  } else if (m.kind === "video_link" || m.kind === "external_link") {
    row = m.externalUrl ? (
      // REQ-MAT-007: a link leaves the platform and says so; a video is a link, never an embed (DEC-209).
      <a href={m.externalUrl} target="_blank" rel="noopener noreferrer" className={`${ROW} hover:bg-hover`}>
        <Head tile={<LinkIcon />} title={m.title} meta={join(phase, t(`kind.${m.kind}`), t("row.leaves"))} />
      </a>
    ) : (
      <div className={ROW}>
        <Head tile={<LinkIcon />} title={m.title} meta={join(phase, t(`kind.${m.kind}`))} />
      </div>
    );
  } else if (m.kind === "audio") {
    const note = downloadable ? t("audio.listenAndDownload") : t("audio.listenOnly");
    row = playbackUrl ? (
      <AudioRow
        src={playbackUrl}
        title={m.title}
        // As drawn (`EventDone.dc.html`, «58:12 · للاستماع فقط»): no phase word on a playing row. REQ-MAT-006 is
        // a visibility rule the policy enforces, not a label; staff still see and change the phase in the settings.
        note={note}
        labels={{ play: t("audio.play"), pause: t("audio.pause"), seek: t("audio.seek") }}
      />
    ) : (
      <div className={ROW}>
        <Head tile={t("audio.tile")} title={m.title} meta={join(phase, t("audio.unavailable"))} />
      </div>
    );
  } else {
    row = (
      <div className={ROW}>
        <Head tile={m.kind === "image" ? <ImageIcon /> : t(`kind.${m.kind}`)} title={m.title} meta={join(phase, t(`kind.${m.kind}`))} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {m.kind === "pdf" && !ready ? (
        <div className={ROW}>
          <Head tile={t("kind.pdf")} title={m.title} meta={join(phase, m.renderStatus === "failed" ? t("renderStatus.failed") : t("renderStatus.rendering"))} />
        </div>
      ) : (
        row
      )}
      {m.kind === "pdf" && (m.renderStatus === "pending" || m.renderStatus === "rendering") ? (
        <div className="max-w-xs">
          <Progress label={t("renderStatus.pending")} />
        </div>
      ) : null}
      {m.kind === "pdf" && m.renderStatus === "failed" ? (
        <Badge tone="error" size="sm" className="self-start">
          {t("renderStatus.failed")}
        </Badge>
      ) : null}
      {canManage ? (
        <EditOnly>
          {m.fontSubstitutionWarning ? (
            <Panel tone="info" className="p-3">
              <p className="text-body-sm text-fg-heading">{t.rich("substitutionWarning.body", { family: m.fontSubstitutionWarning, bdi: (chunks) => <bdi>{chunks}</bdi> })}</p>
            </Panel>
          ) : null}
          {scope ? (
            <RescopeChip
              currentLabel={scope.currentLabel}
              options={scope.options}
              triggerAriaLabel={t.markup("rescope.trigger", { label: scope.currentLabel, bdi: (chunks) => chunks })}
              failedLabel={t("rescope.failed")}
              rescopeAction={rescopeMaterialAction.bind(null, locale, sessionId, m.id)}
            />
          ) : null}
          <SettingsForm locale={locale} materialId={m.id} phase={m.phase} allowDownload={m.allowDownload} sessionDayId={m.sessionDayId} />
        </EditOnly>
      ) : null}
    </div>
  );
}
