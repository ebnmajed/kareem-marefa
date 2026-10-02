"use client";

import type { ReactNode } from "react";
import { useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import { EmptyState } from "@/components/ui/empty-state";
import { SplitView } from "@/components/ui/split-view";
import { TagChip } from "@/components/ui/tag-chip";
import type { ProposalQueueFilter, ProposalQueueItem, ProposalState } from "@/lib/dal/proposals";

// SCR-041's queue — REQ-UIX-088, DEC-NEXT-27. The list is the LAYOUT's, so it stays mounted while the detail beside
// it changes: focus stays on the row (`ui/split-view`'s keyboard model) and the reviewer never loses their place.
//
// ★ The filter is `?state=`, read on the client: a layout is never handed `searchParams`, and the layout's one read
// already holds every proposal past `draft`. The open proposal is the route's segment; on the queue's own route it is
// the first row of the filter, which is the detail the index page draws beside it.

const FILTERS: readonly ProposalQueueFilter[] = ["pending", "changes", "approved", "all"];
const IN: Record<ProposalQueueFilter, readonly ProposalState[]> = {
  pending: ["submitted", "in_review"],
  changes: ["changes_requested"],
  approved: ["approved"],
  all: ["submitted", "in_review", "changes_requested", "approved", "rejected"],
};

function filterOf(raw: string | null): ProposalQueueFilter {
  return raw === "changes" || raw === "approved" || raw === "all" ? raw : "pending";
}

export function QueueView({
  items,
  counts,
  children,
}: {
  items: ProposalQueueItem[];
  counts: Record<ProposalQueueFilter, number>;
  children: ReactNode;
}) {
  const t = useTranslations("proposals.review");
  const params = useSearchParams();
  const segment = useSelectedLayoutSegment();
  const filter = filterOf(params.get("state"));
  const query = filter === "pending" ? "" : `?state=${filter}`;
  const shown = items.filter((item) => IN[filter].includes(item.state));
  const currentId = segment ?? shown[0]?.id ?? null;

  return (
    <SplitView
      label={t("listLabel")}
      narrow={segment ? "detail" : "list"}
      currentId={currentId}
      back={{ href: `/app/admin/proposals${query}`, label: t("back") }}
      toolbar={
        <nav aria-label={t("filtersLabel")} className="mb-3">
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map((f) => (
              <li key={f} className="shrink-0">
                <TagChip
                  label={t(`filters.${f}`)}
                  href={f === "pending" ? "/app/admin/proposals" : `/app/admin/proposals?state=${f}`}
                  count={f === "all" ? undefined : counts[f]}
                  selected={f === filter}
                />
              </li>
            ))}
          </ul>
        </nav>
      }
      empty={
        <EmptyState
          size="sm"
          title={filter === "pending" ? t("empty") : t("emptyFiltered")}
          action={{ label: t("emptyAction"), href: "/app/admin" }}
        />
      }
      items={shown.map((item) => ({
        id: item.id,
        href: `/app/admin/proposals/${item.id}${query}`,
        children: (
          <span className="flex flex-col gap-1">
            <span className="text-body font-semibold text-fg-heading">
              <bdi>{item.title}</bdi>
            </span>
            <span className="flex flex-wrap items-center justify-between gap-x-3 text-caption text-fg-muted">
              <span>
                <bdi>{item.proposerName}</bdi>
                {item.companyName ? (
                  <>
                    {" · "}
                    <bdi>{item.companyName}</bdi>
                  </>
                ) : null}
              </span>
              <span>{t("age", { count: item.ageDays, value: formatNumber(item.ageDays) })}</span>
            </span>
          </span>
        ),
      }))}
      detail={children}
      detailLabelledBy="proposal-title"
    />
  );
}
