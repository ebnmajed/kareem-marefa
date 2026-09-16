import { getTranslations } from "next-intl/server";
import type { DesignerSlotProps } from "@/components/posters/slots";
import { getSessionPoster, MIN_UPLOADED_POSTER_SHORT_SIDE } from "@/lib/dal/posters";
import { formatNumber } from "@/components/sessions/numerals";
import { SessionPoster } from "@/components/posters/session-poster";

// The `PosterPicker` slot on SCR-043 — REQ-DSG-002, REQ-DSG-003, DEC-012.
//
// The three paths, and the one sentence each that an admin needs BEFORE
// choosing rather than after. «تخصيص» in particular: the first edit detaches
// and the detach is one way, so saying so here is the difference between a
// decision and a surprise.
//
// `console` owns SCR-043 and the lead wires this in. No heading of its own.

export async function PosterPicker({ sessionId, locale }: DesignerSlotProps) {
  const [t, poster] = await Promise.all([getTranslations("designer.poster.picker"), getSessionPoster(locale, sessionId)]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-fg-muted">{t("intro")}</p>

      {poster ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-body-sm text-fg-heading">{t(`state.${poster.mode}`)}</p>
          <p className="text-body-sm text-fg-muted">{poster.binding === "live" ? t("live") : t("detached")}</p>
        </div>
      ) : null}

      <div className="max-w-sm">
        <SessionPoster sessionId={sessionId} locale={locale} variant="square" />
      </div>

      <ul className="flex flex-col gap-3">
        <li className="rounded-field border border-edge p-3">
          <p className="text-body-sm text-fg-heading">{t("auto")}</p>
          <p className="mt-1 text-body-sm text-fg-muted">{t("autoHint")}</p>
        </li>
        <li className="rounded-field border border-edge p-3">
          <p className="text-body-sm text-fg-heading">{t("customise")}</p>
          {/* ★ The detach is one way, and it is said BEFORE the click. */}
          <p className="mt-1 text-body-sm text-fg-muted">{t("customiseHint")}</p>
          {poster?.documentId ? (
            <a
              href={`/${locale}/app/admin/designer/${poster.documentId}`}
              className="mt-3 inline-flex h-11 items-center rounded-field border border-edge-strong px-4 text-body-sm text-fg-heading"
            >
              {t("openDesigner")}
            </a>
          ) : null}
        </li>
        <li className="rounded-field border border-edge p-3">
          <p className="text-body-sm text-fg-heading">{t("upload")}</p>
          <p className="mt-1 text-body-sm text-fg-muted">
            {t.rich("uploadHint", { minimum: formatNumber(MIN_UPLOADED_POSTER_SHORT_SIDE), bdi: (c) => <bdi>{c}</bdi> })}
          </p>
        </li>
      </ul>
    </div>
  );
}
