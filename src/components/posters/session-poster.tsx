import { getTranslations } from "next-intl/server";
import type { DesignerSlotProps } from "@/components/posters/slots";
import { getSessionPoster, type PosterVariant } from "@/lib/dal/posters";
import { formatNumber } from "@/components/sessions/numerals";

// The `SessionPoster` slot — REQ-DSG-001, REQ-DSG-002, DEC-012.
//
// Item 1 of the event page and the image on every browse card. No heading of
// its own: the host page owns the landmark, and a slot repeating it is
// announced twice by a screen reader (TEAM.md §3).
//
// RENDERS NOTHING when there is no poster or none has finished. A session
// mid-render and a session with no poster look the same to a reader, and a
// broken frame is worse than an absence — the picker on SCR-043 is where an
// admin is told which it is.
//
// Not `next/image`: the source is a short-lived signed URL from a private
// bucket (03 §6), so there is nothing for the optimiser to cache and a
// stable remote pattern would have to be configured for a URL that expires
// in five minutes.

export async function SessionPoster({ sessionId, locale, variant = "master" }: DesignerSlotProps & { variant?: PosterVariant }) {
  const poster = await getSessionPoster(locale, sessionId, variant);
  if (!poster) return null;

  const t = await getTranslations("designer.poster");

  if (!poster.imageUrl) {
    // Rendering. Said once, quietly, with the count — an admin watching a
    // publish wants to know it is moving.
    if (poster.total === 0) return null;
    return (
      <p className="text-body-sm text-fg-muted">
        {t.rich("pending", {
          ready: formatNumber(poster.ready),
          total: formatNumber(poster.total),
          bdi: (c) => <bdi>{c}</bdi>,
        })}
      </p>
    );
  }

  return (
    <figure className="m-0">
      {/* A plain <img>, not next/image: a signed URL from a private bucket
          expires in five minutes, so there is nothing to optimise and no
          stable remote pattern to declare.

          ★ THE BOX IS RESERVED BEFORE THE IMAGE ARRIVES. Without it the
          whole event page jumped when the poster loaded, and the M2
          demonstrable's phone run timed out because Playwright never saw a
          stable target (the lead's finding at sync 8). The artifact's OWN
          size is used when it is known: the master's 4:5 is the wrong ratio
          for `square` or `og`, and a box reserved at the wrong ratio shifts
          the page exactly as badly as no box at all. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={poster.imageUrl}
        alt=""
        className="w-full rounded-card border border-edge bg-silver-100"
        loading="lazy"
        decoding="async"
        {...(poster.width && poster.height ? { width: poster.width, height: poster.height } : {})}
        style={{ aspectRatio: poster.width && poster.height ? `${poster.width} / ${poster.height}` : "1080 / 1350" }}
      />
      {poster.staleSince ? (
        <figcaption role="status" className="mt-2 text-body-sm text-fg-heading">
          {t("stale")}
        </figcaption>
      ) : null}
    </figure>
  );
}
