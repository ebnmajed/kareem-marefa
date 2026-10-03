"use client";

import type { ReactNode } from "react";
import { useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import { EmptyState } from "@/components/ui/empty-state";
import { SplitView } from "@/components/ui/split-view";
import { TagChip } from "@/components/ui/tag-chip";
import type { PhotoQueue } from "@/lib/dal/admin-moderation";
import { photoFilter, type PhotoFilter } from "./kind";

// SCR-051's queue — REQ-UIX-104, on `sessions'` `split-view` as built. The chips are links (`?kind=`), read on the
// client because a layout is never handed `searchParams`; the open photo is the route's segment, and on the queue's own
// route it is the filter's first row — the photo the index page draws beside it.

const FILTERS: readonly PhotoFilter[] = ["takedowns", "reports", "closed"];
const BASE = "/app/admin/moderation/photos";
const NEXT: Record<PhotoFilter, PhotoFilter> = { takedowns: "reports", reports: "closed", closed: "takedowns" };

const query = (f: PhotoFilter) => (f === "takedowns" ? "" : `?kind=${f}`);

export function QueueView({ queue, children }: { queue: PhotoQueue; children: ReactNode }) {
  const t = useTranslations("photos.moderation");
  const params = useSearchParams();
  const segment = useSelectedLayoutSegment();
  const filter = photoFilter(params.get("kind"));
  const bdi = (chunks: ReactNode) => <bdi>{chunks}</bdi>;
  const age = (days: number) => t("age", { count: days, value: formatNumber(days) });

  const items =
    filter === "closed"
      ? queue.closed.map((item) => ({
          id: item.photoId,
          thumb: item.thumbUrl,
          session: item.sessionTitle,
          line: (
            <>
              {t(`outcome.${item.decision.outcome}`)}
              {item.decision.by ? (
                <>
                  {" · "}
                  <bdi>{item.decision.by.name ?? t("member")}</bdi>
                </>
              ) : null}
              {" · "}
              {age(item.decision.ageDays)}
            </>
          ),
        }))
      : queue[filter].map((item) => ({
          id: item.photoId,
          thumb: item.thumbUrl,
          session: item.sessionTitle,
          line: (
            <>
              {t.rich(filter === "takedowns" ? "requested" : "reported", { name: item.first?.name ?? t("member"), bdi })}
              {item.more > 0 ? ` +${formatNumber(item.more)}` : null}
              {" · "}
              {age(item.ageDays)}
            </>
          ),
        }));

  const currentId = segment ?? items[0]?.id ?? null;

  return (
    <SplitView
      label={filter === "closed" ? t("closedLabel") : t("listLabel")}
      narrow={segment ? "detail" : "list"}
      currentId={currentId}
      back={{ href: `${BASE}${query(filter)}`, label: t("back") }}
      toolbar={
        <nav aria-label={t("filtersLabel")} className="mb-3">
          <ul className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <li key={f}>
                <TagChip
                  label={f === "closed" ? t(`filter.${f}`) : `${t(`filter.${f}`)} ${formatNumber(queue[f].length)}`}
                  href={`${BASE}${query(f)}`}
                  selected={f === filter}
                />
              </li>
            ))}
          </ul>
        </nav>
      }
      empty={<EmptyState size="sm" title={t(`empty.${filter}`)} action={{ label: t(`filter.${NEXT[filter]}`), href: `${BASE}${query(NEXT[filter])}` }} />}
      items={items.map((item) => ({
        id: item.id,
        href: `${BASE}/${item.id}${query(filter)}`,
        children: (
          <span className="flex items-center gap-3">
            {item.thumb ? (
              // A signed preview of the stripped photo (REQ-EVT-011); decorative beside the row's own words.
              // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived preview; next/image would re-host it
              <img src={item.thumb} alt="" loading="lazy" decoding="async" className="size-14 shrink-0 rounded-field object-cover" />
            ) : (
              <span aria-hidden="true" className="size-14 shrink-0 rounded-field bg-raised" />
            )}
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-body font-semibold text-fg-heading">{t.rich("row", { session: item.session, bdi })}</span>
              <span className="text-caption text-fg-muted">{item.line}</span>
            </span>
          </span>
        ),
      }))}
      detail={children}
      detailLabelledBy="photo-title"
    />
  );
}
