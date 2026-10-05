import type { CSSProperties } from "react";
import type { getTranslations } from "next-intl/server";
import { rescopePhotoAction } from "@/components/photos/actions";
import { LightboxTile } from "@/components/photos/lightbox";
import { TakedownButton } from "@/components/photos/takedown-button";
import { RescopeChip, type RescopeOption } from "@/components/materials/rescope-chip";
import { EditOnly } from "@/components/sessions/edit-mode";
import { teamColorOrNull } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { PhotoSummary } from "@/lib/dal/photos";

// The photographs as a grid — `EventLive.dc.html:62-66`, `EventDone.dc.html:78-82`. Three to a row, square.
//
// ★ THE TILE CROPS, ON PURPOSE (REQ-UIX-026 asks a photo surface to say so, and why): the grid is an index for
// FINDING a photograph, not a place to read one. Uniform squares keep three columns scannable at 390 px, where
// letterboxed portrait and landscape tiles make it ragged. A photograph is not a designed artefact — the poster
// rule's own carve-out. The crop is centred: nobody sets a focal point on a member's photograph, and detecting
// faces to choose one would be a new processing of personal data. The whole frame is one tap away in the
// lightbox, which never crops.
// ★ A tile is the lightbox's button and nothing else: «احذف الصور التي أظهر فيها» is in the lightbox now
// (DEC-209). A HIDDEN photograph — only staff see one — is outside the lightbox, badged, with its restore here.
// ★ The uploader's company colour is a ring dot at the tile's corner (`EventLive.dc.html:64`), decoration: it
// reaches the DOM only as `--team`, and a company with no colour draws the neutral ring.
// ★ The event page's edit mode (`sessions/edit-mode.tsx`): a hidden photograph with its restore, and the re-scope
// chip, are staff's and drawn in edit mode alone — read mode shows what a member sees.

type T = Awaited<ReturnType<typeof getTranslations>>;

export function PhotoGrid({
  photos,
  sessionId,
  locale,
  isStaff,
  t,
  scope,
  lead,
}: {
  photos: PhotoSummary[];
  sessionId: string;
  locale: string;
  isStaff: boolean;
  t: T;
  scope: { currentLabel: string; options: RescopeOption[] } | null;
  /** The live session's add tile, first in the grid. */
  lead?: React.ReactNode;
}) {
  return (
    <ul className="grid grid-cols-3 gap-1.5">
      {lead ? <li className="min-w-0">{lead}</li> : null}
      {photos.map((p) => {
        const colour = teamColorOrNull(p.uploaderTeamColor ?? null);
        const tile = (
          <li key={p.id} className="flex min-w-0 flex-col gap-1.5">
            {p.url ? (
              <div className="relative">
                <LightboxTile photoId={p.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a signed URL, not a static/optimizable asset */}
                  <img src={p.url} alt="" loading="lazy" decoding="async" className={`aspect-square w-full rounded-tile object-cover object-center ${p.hiddenAt ? "opacity-45" : ""}`} />
                </LightboxTile>
                <span
                  aria-hidden
                  className={`pointer-events-none absolute bottom-1.5 start-1.5 size-5 rounded-pill border-2 bg-canvas ${colour ? "border-team" : "border-team-neutral"}`}
                  style={colour ? ({ "--team": colour } as CSSProperties) : undefined}
                />
              </div>
            ) : null}
            {p.hiddenAt ? (
              <>
                <Badge tone="error" outline size="sm" className="self-start">
                  {t("hiddenBadge")}
                </Badge>
                {isStaff ? <TakedownButton locale={locale} sessionId={sessionId} photoId={p.id} mode="restore" /> : null}
              </>
            ) : null}
            {scope && isStaff ? (
              <EditOnly>
                <RescopeChip
                  currentLabel={scope.currentLabel}
                  options={scope.options}
                  triggerAriaLabel={t.markup("rescope.trigger", { label: scope.currentLabel, bdi: (chunks) => chunks })}
                  failedLabel={t("rescope.failed")}
                  rescopeAction={rescopePhotoAction.bind(null, locale, sessionId, p.id)}
                />
              </EditOnly>
            ) : null}
          </li>
        );
        // Only staff are ever sent a hidden photograph (`photos_read`); it is theirs to restore, in edit mode.
        return p.hiddenAt ? <EditOnly key={p.id}>{tile}</EditOnly> : tile;
      })}
    </ul>
  );
}
