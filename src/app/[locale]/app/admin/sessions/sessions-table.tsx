"use client";

import { useActionState, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ExportDownloadButton } from "@/components/admin/export-download-button";
import { PresenterCell, SeatsCell, WhenCell } from "@/components/admin/sessions/cells";
import { MONTH_NONE, SESSION_STATUS_FILTERS, sessionsHref, type ConsoleSessionRow, type SessionQuery } from "@/components/admin/sessions/session-query";
import { formatNumber } from "@/components/sessions/numerals";
import { SessionStatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { ChevronIcon, SearchIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Link } from "@/components/ui/link";
import { Menu } from "@/components/ui/menu";
import { Prose } from "@/components/ui/prose";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import type { DataTableColumn, MenuItem } from "@/components/ui";
import type { SessionAction } from "@/lib/dal/sessions";
import { useRouter } from "@/i18n/navigation";
import type { BulkCancelState } from "./state";
import { emptyBulkCancelState } from "./state";
import type { TransitionState } from "./actions";
import { SessionRowActions } from "./session-controls";

// SCR-042 · the console's sessions table (`REQ-UIX-087`), written from
// `AdminSessions.dc.html` and `AdminSessionsPhone.dc.html` (wave 21, `DEC-208`).
// The job (`DEC-227` §0.3): a session is found, filtered and acted on in bulk
// at a desk, and the same rows are usable as cards on a phone.
//
// The URL is the list's whole state (`session-query.ts`): the search is a GET
// form and the chips, the sort and the pager are links, so a filtered list is
// shareable, survives a reload and works without JS. Selection is the one
// client state; the server keys this component by the query, so a new query
// starts with nothing selected. `data-table`'s phone stack and selection are
// composed as built; the toolbar gives way to its selection bar while rows are
// selected, so the bulk bar stands where the toolbar stood.

type Mode = "admin" | "moderator";

export function SessionsTable({
  mode,
  rows,
  query,
  total,
  from,
  to,
  page,
  pageCount,
  timeZone,
  locale,
  categories,
  months,
  actionsById,
  transitionActions,
  bulkCancel,
}: {
  mode: Mode;
  rows: ConsoleSessionRow[];
  query: SessionQuery;
  total: number;
  from: number;
  to: number;
  page: number;
  pageCount: number;
  timeZone: string;
  locale: string;
  categories: { id: string; name: string }[];
  /** `YYYY-MM` months that hold a session, newest first. */
  months: string[];
  actionsById: Record<string, SessionAction[]>;
  /** One BOUND Server Action per row — a map, never a factory (a closure cannot cross into a client module). */
  transitionActions: Record<string, (prev: TransitionState, formData: FormData) => Promise<TransitionState>>;
  bulkCancel?: (prev: BulkCancelState, formData: FormData) => Promise<BulkCancelState>;
}) {
  const t = useTranslations("admin.sessions");
  const tStatus = useTranslations("browse.status");
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const admin = mode === "admin";

  const statusLabel = (phase: (typeof SESSION_STATUS_FILTERS)[number]) => tStatus(phase === "pending_schedule" ? "pendingSchedule" : phase);
  const monthLabel = (month: string) =>
    month === MONTH_NONE
      ? t("monthNone")
      : new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-15T12:00:00Z`));

  const titleHref = (s: ConsoleSessionRow) => (admin ? `/app/admin/sessions/${s.id}` : `/app/admin/sessions/${s.id}/attendance`);

  const menuLinks = (s: ConsoleSessionRow): MenuItem[] => [
    { label: t("openEventPage"), href: `/app/sessions/${s.id}` },
    { label: t("schedule"), href: `/app/admin/sessions/${s.id}/schedule` },
    { label: t("attendance"), href: `/app/admin/sessions/${s.id}/attendance` },
    { label: t("certificates"), href: `/app/admin/sessions/${s.id}/certificates` },
    // SCR-064 (wave 10, `DEC-160` contract 6).
    { label: t("survey"), href: `/app/admin/sessions/${s.id}/survey` },
  ];

  const rowMenu = (s: ConsoleSessionRow) => (
    <SessionRowActions title={s.title} links={menuLinks(s)} actions={actionsById[s.id] ?? []} action={transitionActions[s.id]} endsAt={s.endsAt} />
  );

  // A moderator's survey link is named «الاستبانة» and DESCRIBED by the title,
  // never a second copy of it — a spec finds a session by its title (wave 10).
  const surveyLink = (s: ConsoleSessionRow, titleId: string) => (
    <Link href={`/app/admin/sessions/${s.id}/survey`} className="underline underline-offset-4" aria-describedby={titleId}>
      {t("survey")}
    </Link>
  );

  const columns: DataTableColumn<ConsoleSessionRow>[] = [
    {
      key: "title",
      header: t("columnTitle"),
      sortable: true,
      onCard: true,
      cell: (s) => (
        <span id={`session-title-${s.id}`} className="text-label text-fg-heading">
          <bdi>{s.title}</bdi>
        </span>
      ),
    },
    { key: "status", header: t("columnStatus"), sortable: true, cell: (s) => <SessionStatusBadge phase={s.phase} seat={s.seat} size="sm" /> },
    { key: "start", header: t("columnStart"), sortable: true, cell: (s) => <WhenCell row={s} timeZone={timeZone} locale={locale} /> },
    { key: "venue", header: t("columnVenue"), sortable: true, cell: (s) => (s.venueName ? <bdi>{s.venueName}</bdi> : <span className="text-fg-muted">{t("noValue")}</span>) },
    { key: "presenter", header: t("columnPresenter"), sortable: true, cell: (s) => <PresenterCell row={s} /> },
    { key: "seats", header: t("columnSeats"), sortable: true, cell: (s) => <SeatsCell row={s} /> },
    admin
      ? { key: "actions", header: t("actionsLabel"), align: "end", cell: (s) => rowMenu(s) }
      : { key: "survey", header: t("survey"), cell: (s) => surveyLink(s, `session-title-${s.id}`) },
  ];

  // The phone card, as `AdminSessionsPhone.dc.html` draws it: title and status,
  // date · venue, presenter and seats. ★ The ⋯ stays on the card (wave 6's real
  // phone defect: without it a phone had no way to act on a session).
  const card = (s: ConsoleSessionRow, { titleId }: { titleId: string }) => {
    const when = s.startsAt ? <WhenCell row={s} timeZone={timeZone} locale={locale} /> : <span>{t("noValue")}</span>;
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <Link href={titleHref(s)} quiet id={titleId} className="min-w-0 text-label text-fg-heading hover:underline">
            <bdi>{s.title}</bdi>
          </Link>
          <span className="flex shrink-0 items-center gap-1">
            <SessionStatusBadge phase={s.phase} seat={s.seat} size="sm" />
            {admin ? rowMenu(s) : null}
          </span>
        </div>
        <p className="text-body-sm text-fg-muted">
          {when}
          {" · "}
          {s.venueName ? <bdi>{s.venueName}</bdi> : t("noValue")}
        </p>
        <div className="flex items-center justify-between gap-3 text-body-sm">
          <PresenterCell row={s} />
          <span className="shrink-0 text-fg-body">
            <SeatsCell row={s} />
          </span>
        </div>
        {admin ? null : <p className="text-body-sm">{surveyLink(s, titleId)}</p>}
      </div>
    );
  };

  const sort = query.sort === "default" ? undefined : { key: query.sort, direction: query.dir };
  const empty = query.q || query.status || query.category || query.month ? t("searchEmpty") : t("listEmpty");

  const canCancelAll = selected.length > 0 && selected.every((id) => actionsById[id]?.includes("cancel"));
  const exportHref = `/api/admin/exports/sessions?ids=${selected.join(",")}`;

  return (
    <div>
      {selected.length === 0 ? <Toolbar query={query} total={total} categories={categories} months={months} statusLabel={statusLabel} monthLabel={monthLabel} /> : null}

      <DataTable
        className="mt-4"
        label={t("tableLabel")}
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        rowHref={titleHref}
        sort={sort}
        onSortChange={(next) => router.push(sessionsHref(query, { sort: next.key as SessionQuery["sort"], dir: next.direction, page: 1 }))}
        stickyHeader
        renderCard={card}
        selection={
          admin
            ? {
                selected,
                onChange: setSelected,
                label: (count) => t("selected", { count, value: formatNumber(count) }),
                actions: (
                  <>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>
                      {t("bulkClear")}
                    </Button>
                    {canCancelAll && bulkCancel ? <BulkCancel ids={selected} titles={rows.filter((r) => selected.includes(r.id)).map((r) => r.title)} action={bulkCancel} onResult={setSelected} /> : null}
                    <ExportDownloadButton
                      href={exportHref}
                      fallbackName="sessions.csv"
                      label={t("bulkExport")}
                      accessibleName={t("bulkExportName")}
                      pendingLabel={t("bulkExportPending")}
                      doneLabel={t("bulkExportDone")}
                      failedLabel={t("bulkExportFailed")}
                    />
                  </>
                ),
              }
            : undefined
        }
        empty={{ title: empty, action: { label: t("listEmptyAction"), href: "/app/admin/proposals" }, size: "sm" }}
      />

      <Pager query={query} total={total} from={from} to={to} page={page} pageCount={pageCount} />
    </div>
  );
}

/** Search · the three chips, each showing its value · the count. A GET form, so it works without JS. */
function Toolbar({
  query,
  total,
  categories,
  months,
  statusLabel,
  monthLabel,
}: {
  query: SessionQuery;
  total: number;
  categories: { id: string; name: string }[];
  months: string[];
  statusLabel: (phase: (typeof SESSION_STATUS_FILTERS)[number]) => string;
  monthLabel: (month: string) => string;
}) {
  const t = useTranslations("admin.sessions");
  const pathname = usePathname();
  const chip = (label: string, items: MenuItem[]) => (
    <Menu
      trigger={
        <Button type="button" variant="secondary" size="sm" className="shrink-0" iconEnd={<ChevronIcon direction="down" aria-hidden />}>
          <bdi>{label}</bdi>
        </Button>
      }
      items={items}
    />
  );
  const all = t("filterAll");
  const category = categories.find((c) => c.id === query.category);

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
        <form role="search" action={pathname} method="get" className="md:w-70">
          <Field id="sessions-search" label={<span className="sr-only">{t("searchLabel")}</span>}>
            <Input type="search" name="q" defaultValue={query.q} placeholder={t("searchPlaceholder")} startIcon={<SearchIcon aria-hidden />} />
          </Field>
          {query.status ? <input type="hidden" name="status" value={query.status} /> : null}
          {query.category ? <input type="hidden" name="category" value={query.category} /> : null}
          {query.month ? <input type="hidden" name="month" value={query.month} /> : null}
        </form>
        {/* One row of chips that scrolls on its own on a phone — the page never does. */}
        <nav aria-label={t("filtersLabel")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {chip(t("filterStatus", { value: query.status ? statusLabel(query.status) : all }), [
            { label: all, href: sessionsHref(query, { status: null, page: 1 }), current: !query.status },
            ...SESSION_STATUS_FILTERS.map((p) => ({ label: statusLabel(p), href: sessionsHref(query, { status: p, page: 1 }), current: query.status === p })),
          ])}
          {chip(t("filterCategory", { value: category?.name ?? all }), [
            { label: all, href: sessionsHref(query, { category: null, page: 1 }), current: !query.category },
            ...categories.map((c) => ({ label: c.name, href: sessionsHref(query, { category: c.id, page: 1 }), current: query.category === c.id })),
          ])}
          {chip(t("filterMonth", { value: query.month ? monthLabel(query.month) : all }), [
            { label: all, href: sessionsHref(query, { month: null, page: 1 }), current: !query.month },
            ...months.map((m) => ({ label: monthLabel(m), href: sessionsHref(query, { month: m, page: 1 }), current: query.month === m })),
            { label: t("monthNone"), href: sessionsHref(query, { month: MONTH_NONE, page: 1 }), current: query.month === MONTH_NONE },
          ])}
        </nav>
      </div>
      <p className="shrink-0 text-caption text-fg-muted">
        <bdi>{t("count", { count: total, value: formatNumber(total) })}</bdi>
      </p>
    </div>
  );
}

/** «1 – 9 من 41» with السابقة / التالية at a desk; «6 من 41 · المزيد» on a phone. Links, so no JS is needed. */
function Pager({ query, total, from, to, page, pageCount }: { query: SessionQuery; total: number; from: number; to: number; page: number; pageCount: number }) {
  const t = useTranslations("admin.sessions");
  if (total === 0) return null;
  const n = formatNumber;
  const prev = page > 1 ? sessionsHref(query, { page: page - 1 }) : null;
  const next = page < pageCount ? sessionsHref(query, { page: page + 1 }) : null;
  return (
    <nav aria-label={t("pagerLabel")} className="mt-4 flex flex-wrap items-center justify-between gap-3 text-caption text-fg-muted">
      <p className="hidden md:block">
        <bdi>{t("pageRange", { from: n(from), to: n(to), total: n(total) })}</bdi>
      </p>
      <p className="md:hidden">
        <bdi>{t("phoneRange", { shown: n(to), total: n(total) })}</bdi>
      </p>
      {pageCount > 1 ? (
        <div className="flex gap-2">
          {prev ? (
            <ButtonLink href={prev} variant="secondary" size="sm">
              {t("previous")}
            </ButtonLink>
          ) : null}
          {next ? (
            <>
              {/* The width decides on a wrapper, never on the link: `ButtonLink` carries its own
                  `inline-flex`, and a `hidden` beside it loses to it — the phone showed both. */}
              <span className="hidden md:inline-flex">
                <ButtonLink href={next} variant="secondary" size="sm">
                  {t("next")}
                </ButtonLink>
              </span>
              <span className="inline-flex md:hidden">
                <ButtonLink href={next} variant="secondary" size="sm">
                  {t("more")}
                </ButtonLink>
              </span>
            </>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}

/**
 * «ألغِ الجلسات» — offered only when every selected row admits cancel. One
 * dialog naming the count and the titles, one required reason, then the same
 * `transition_session()` row by row (`runBulkCancel`). The toast comes from
 * the action; what failed stays selected, so the retry is one press away.
 */
function BulkCancel({ ids, titles, action, onResult }: { ids: string[]; titles: string[]; action: (prev: BulkCancelState, formData: FormData) => Promise<BulkCancelState>; onResult: (selected: string[]) => void }) {
  const t = useTranslations("admin.sessions");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: BulkCancelState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.error === "actionFailed") toast.show({ title: t("actionFailed"), tone: "error" });
    if (result.error === null) {
      const parts = [t("bulkCancelled", { count: result.done.length, value: formatNumber(result.done.length) })];
      if (result.failed.length) parts.push(t("bulkCancelFailed", { count: result.failed.length, value: formatNumber(result.failed.length) }));
      toast.show({ title: parts.join(" · "), tone: result.failed.length ? "error" : "success" });
      onResult(result.failed);
    }
    return result;
  }, emptyBulkCancelState);

  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.error !== "cancelReasonRequired") setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="danger" size="sm" onClick={() => setOpen(true)}>
        {t("bulkCancel")}
      </Button>
      <DialogContent title={t("bulkCancelTitle", { count: ids.length, value: formatNumber(ids.length) })} closeLabel={t("closeDialog")}>
        <form action={formAction} noValidate>
          {ids.map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          <ul className="mb-4 list-disc space-y-1 ps-5 text-body-sm text-fg-body">
            {titles.map((title, i) => (
              <li key={`${title}-${i}`}>
                <bdi>{title}</bdi>
              </li>
            ))}
          </ul>
          <Field label={t("cancelReasonLabel")} required error={state.error === "cancelReasonRequired" ? t("cancelReasonRequired") : undefined}>
            <Textarea name="reason" rows={3} maxLength={2000} />
          </Field>
          <Prose size="sm">
            <p>{t("cancelConfirmBody")}</p>
          </Prose>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="submit" variant="danger" pending={pending}>
              {t("cancelConfirmAction")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t("cancelDialogCancel")}
              </Button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
