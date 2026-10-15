"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { EyeIcon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { formatNumber } from "@/components/sessions/numerals";
import type { ViewKind } from "@/components/views/tracker";

// «👁 N» — REQ-VEW-003, REQ-VEW-004, DEC-297; docs/plan/notes/views.md §1.2 – §1.3, §8.3. The unique viewers of a
// story frame, a post, a recap or an announcement, shown to everyone who sees the subject and NEVER at 0. For the
// subject's owners and staff (`canList`) it is a button that opens who viewed — name, avatar and the day, newest first,
// nothing finer — fetched when the sheet opens; for anyone else it is the number and nothing to press. The eye is
// `ui/icons`' own (no design mark exists for a view); the number is `<bdi>`, Western digits (DEC-124).

export interface ViewCountData {
  count: number;
  canList: boolean;
}

interface Viewer {
  memberId: string;
  name: string;
  avatarHref: string | null;
  day: string;
}

type ListState = { status: "loading" } | { status: "ready"; viewers: Viewer[]; total: number } | { status: "failed" };

export function ViewCount({
  kind,
  id,
  views,
  onOpenChange,
  className = "",
}: {
  kind: ViewKind;
  id: string;
  views: ViewCountData | null | undefined;
  /** The story viewer holds its clock while the list is open. */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const t = useTranslations("views");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ListState>({ status: "loading" });

  if (!views || views.count < 1) return null;
  const count = views.count;
  const label = t("count", { count, value: formatNumber(count) });
  const face = (
    <>
      <EyeIcon aria-hidden className="text-[1.125rem]" />
      <bdi aria-hidden className="tabular-nums">
        {formatNumber(count)}
      </bdi>
    </>
  );
  const chip = "inline-flex min-h-11 items-center gap-1.5 rounded-pill px-2 text-label font-bold text-fg-muted";

  if (!views.canList) {
    return (
      <span role="img" aria-label={label} data-view-count={kind} className={`${chip} ${className}`}>
        {face}
      </span>
    );
  }

  async function load() {
    setList({ status: "loading" });
    try {
      const res = await fetch(`/api/views/${kind}/${id}`, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { viewers: Viewer[]; total: number };
      setList({ status: "ready", viewers: body.viewers, total: body.total });
    } catch {
      setList({ status: "failed" });
    }
  }

  function change(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
    if (next) void load();
  }

  const day = (iso: string) => new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

  return (
    <>
      <button type="button" aria-label={label} aria-haspopup="dialog" data-view-count={kind} onClick={() => change(true)} className={`${chip} hover:bg-hover ${className}`}>
        {face}
      </button>
      <Sheet open={open} onOpenChange={change} title={t("title")}>
        {list.status === "failed" ? (
          <p role="status" className="text-body font-bold">
            {t("failed")}
          </p>
        ) : list.status === "loading" ? (
          <ul aria-busy="true" className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <li key={i} aria-hidden className="h-11 rounded-tile bg-raised" />
            ))}
          </ul>
        ) : (
          <>
            <ul className="flex flex-col gap-3" data-viewer-list="">
              {list.viewers.map((v) => (
                <li key={v.memberId} className="flex items-center gap-3">
                  <Avatar memberId={v.memberId} displayName={v.name} src={v.avatarHref} size={40} decorative />
                  <bdi className="min-w-0 flex-1 truncate py-1 text-body font-bold leading-[1.7]">{v.name}</bdi>
                  <span className="shrink-0 text-caption text-fg-muted">
                    <bdi>{day(v.day)}</bdi>
                  </span>
                </li>
              ))}
            </ul>
            {list.total > list.viewers.length ? (
              <p className="mt-3 text-caption text-fg-muted">{t("more", { count: list.total - list.viewers.length, value: formatNumber(list.total - list.viewers.length) })}</p>
            ) : null}
          </>
        )}
      </Sheet>
    </>
  );
}
