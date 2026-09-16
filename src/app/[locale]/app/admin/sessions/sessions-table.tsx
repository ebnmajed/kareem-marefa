"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@/components/sessions/numerals";
import { Badge, SessionStatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { Menu } from "@/components/ui/menu";
import { MoreIcon } from "@/components/ui/icons";
import { storedPhase } from "@/lib/session-status";
import type { AdminSession, AttendanceSessionRow, SessionAction } from "@/lib/dal/sessions";
import { SessionControls } from "./session-controls";
import type { TransitionState } from "./actions";

// SCR-042's "كل الجلسات" (`REQ-ADM-005`), onto `ui/data-table` for wave 6
// (`16` §6.7, `DEC-130`) — one of the three lists that most need the phone
// card stack (`DEC-130`'s own justification). A client component: sort and
// the search box are BOTH the calling screen's composition per
// `DataTableProps`' own frozen type (no `search`/`pagination` field —
// `docs/plan/notes/console.md`'s Wave 6 finding), and both need state.
//
// ★ Status reads through `storedPhase()` (`@/lib/session-status`, the lead's,
// read-only) rather than the raw `SessionState` string this screen showed
// before — `completed`/`archived`/`cancelled` now read through the SAME
// «انتهت»/«أُلغيت» badges the rest of the product uses, closing the "ended is
// badged separately here" gap this track's own M9 note flagged.
//
// No `rowHref` and no `selection`: multiple per-row destinations already
// exist via the row `Menu` (a single whole-row link would conflict with it),
// and nothing backs a bulk transition (`runTransition` is per-session).

type SortKey = "title" | "status" | "start";

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

export function AdminSessionsTable({
  sessions,
  actionsById,
  timeZone,
  locale,
  transitionActions,
}: {
  sessions: AdminSession[];
  /** `actionsFor(state)` (`lib/dal/sessions.ts`, sessions' file, `import
   *  "server-only"`), computed SERVER-SIDE per row in `page.tsx` and threaded
   *  down — this is a `"use client"` module, so it cannot import that
   *  function's own module directly, only the TYPES it returns. */
  actionsById: Record<string, SessionAction[]>;
  timeZone: string;
  locale: string;
  /** Each entry is `runTransition.bind(null, locale, sessionId)`, bound ONCE
   *  per row in `page.tsx` and handed down as a map — never a factory
   *  function returning a bound action. A factory is a plain closure crossing
   *  the server/client boundary as a prop, which React Flight cannot
   *  serialise (only an actual bound Server Action reference survives the
   *  crossing); `page.tsx`'s own comment on `transitionActions` has the
   *  full reasoning. */
  transitionActions: Record<string, (prev: TransitionState, formData: FormData) => Promise<TransitionState>>;
}) {
  const t = useTranslations("admin.sessions");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" } | undefined>(undefined);

  const filtered = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return sessions;
    return sessions.filter((s) => normalize(s.title).includes(needle) || s.presenters.some((p) => normalize(p.displayName ?? "").includes(needle)));
  }, [sessions, query]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "title") return a.title.localeCompare(b.title, "ar") * dir;
      if (sort.key === "status") return storedPhase(a.state).localeCompare(storedPhase(b.state)) * dir;
      // "start": unscheduled sessions sort last regardless of direction — a
      // null date compared with `<`/`>` is meaningless, not "earliest".
      const av = a.startsAt ? new Date(a.startsAt).getTime() : null;
      const bv = b.startsAt ? new Date(b.startsAt).getTime() : null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
  }, [filtered, sort]);

  const columns: DataTableColumn<AdminSession>[] = [
    {
      key: "title",
      header: t("columnTitle"),
      sortable: true,
      onCard: true,
      cell: (s) => (
        <span className="text-label text-fg-heading">
          <bdi>{s.title}</bdi>
        </span>
      ),
    },
    {
      key: "status",
      header: t("columnStatus"),
      sortable: true,
      onCard: true,
      cell: (s) => <SessionStatusBadge phase={storedPhase(s.state)} size="sm" />,
    },
    {
      key: "start",
      header: t("columnStart"),
      sortable: true,
      onCard: true,
      cell: (s) =>
        s.startsAt ? (
          <bdi>{formatDateTime(s.startsAt, timeZone, locale)}</bdi>
        ) : (
          <span className="text-fg-muted">{t("notScheduled")}</span>
        ),
    },
    {
      key: "presenterStatus",
      header: t("presentersLabel"),
      onCard: true,
      cell: (s) => {
        const declined = s.presenters.some((p) => p.declinedAt !== null);
        const pending = s.presenters.some((p) => !p.accepted && p.declinedAt === null);
        if (declined) return <Badge tone="error" size="sm">{t("presenterDeclined")}</Badge>;
        if (pending) return <Badge tone="live" size="sm">{t("presenterPending")}</Badge>;
        return <span className="text-fg-muted">—</span>;
      },
    },
    {
      key: "actions",
      header: t("actionsLabel"),
      align: "end",
      cell: (s) => (
        <Menu
          align="end"
          trigger={
            <IconButton label={t.markup("moreActions", { title: s.title, t: (chunks) => chunks })} size="sm">
              <MoreIcon />
            </IconButton>
          }
          items={[
            { label: t("openEventPage"), href: `/app/sessions/${s.id}` },
            { label: t("schedule"), href: `/app/admin/sessions/${s.id}/schedule` },
            { label: t("attendance"), href: `/app/admin/sessions/${s.id}/attendance` },
            { label: t("certificates"), href: `/app/admin/sessions/${s.id}/certificates` },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <Field id="sessions-search" label={t("searchLabel")} className="max-w-sm">
        <Input type="search" placeholder={t("searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
      </Field>

      <DataTable
        className="mt-4"
        label={t("tableLabel")}
        columns={columns}
        rows={sorted}
        rowKey={(s) => s.id}
        sort={sort}
        onSortChange={(next) => setSort(next as { key: SortKey; direction: "asc" | "desc" })}
        empty={{ title: t("searchEmpty"), action: { label: t("scheduleNote"), href: "/app/admin/proposals" } }}
      />

      {/* «إجراءات المشرف» (start/complete/cancel/archive/reopen, REQ-SES-005)
          — ALWAYS visible per session, not gated behind a click: these are
          the state machine's own controls (`actionsFor`), the same "stay
          plain buttons" treatment `admin/proposals/review-card.tsx` gives
          approve. Rendered below the table rather than inside a `DataTable`
          cell — a row of several buttons plus a cancel-reason disclosure has
          nowhere to fit in one table cell, on either width. */}
      {sorted
        .filter((s) => (actionsById[s.id]?.length ?? 0) > 0 && transitionActions[s.id])
        .map((s) => (
          <div key={s.id} className="mt-3 rounded-field border border-edge p-4">
            <p className="text-label text-fg-heading">
              <bdi>{s.title}</bdi>
            </p>
            <SessionControls action={transitionActions[s.id]} actions={actionsById[s.id] ?? []} sessionTitle={s.title} />
          </div>
        ))}
    </div>
  );
}

export function ModeratorSessionsTable({ sessions, timeZone, locale }: { sessions: AttendanceSessionRow[]; timeZone: string; locale: string }) {
  const t = useTranslations("admin.sessions");

  const columns: DataTableColumn<AttendanceSessionRow>[] = [
    {
      key: "title",
      header: t("columnTitle"),
      onCard: true,
      cell: (s) => (
        <span className="text-label text-fg-heading">
          <bdi>{s.title}</bdi>
        </span>
      ),
    },
    {
      key: "status",
      header: t("columnStatus"),
      onCard: true,
      cell: (s) => <SessionStatusBadge phase={storedPhase(s.state)} size="sm" />,
    },
    {
      key: "start",
      header: t("columnStart"),
      onCard: true,
      cell: (s) => (s.startsAt ? <bdi>{formatDateTime(s.startsAt, timeZone, locale)}</bdi> : <span className="text-fg-muted">{t("notScheduled")}</span>),
    },
  ];

  return (
    <DataTable
      label={t("tableLabel")}
      columns={columns}
      rows={sessions}
      rowKey={(s) => s.id}
      rowHref={(s) => `/app/admin/sessions/${s.id}/attendance`}
      empty={{ title: t("listEmpty"), action: { label: t("openAttendance"), href: "/app/admin" } }}
    />
  );
}
