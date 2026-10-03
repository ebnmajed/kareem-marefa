"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { CertificateRenderStatus, SessionCertificateRow } from "@/lib/dal/certificates";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import type { DataTableColumn } from "@/components/ui";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Link } from "@/components/ui/link";
import { useToast } from "@/components/ui/toast";
import { releaseHeld, retryCertificateRender } from "./actions";

// SCR-045 after completion — `AdminCertificates.dc.html`'s two tables, in its order: «محجوزة · N» with «أصدر المحدّد»
// (primary) and «أصدر الكل», then «صادرة · N» with each certificate's «PDF» and «ألغِ» (REQ-UIX-109, REQ-CRT-004,
// REQ-CRT-011). `ui/data-table`'s selection and phone stack are composed as they are.
//
// ★ Issuing releases a held certificate: `release_certificates()` audits each one (`certificate.released`) and is the one
// door to the member's inbox — a held certificate is invisible to its member and unmailed until then. It confirms with
// the count and the session (REQ-UIX-013, REQ-DSG-031's «one confirmed button»): it mails, and cannot be undone.
// ★ «PDF» is a plain link to the ONE audited route (DEC-177, DEC-178) — never a URL signed at render time — and only for
// an issued certificate whose file has rendered; a pending file says so, a failed one is re-rendered alone
// (REQ-DSG-031). ★ «ألغِ» is a link to `?revoke=<id>`: the reason is mandatory and written in a sheet, without JS too.
// Revoked certificates, and eligible members holding no live one, show only when there are some (note §3).
// Every result is a toast from the action's own answer, inside the transition (wave 6's trap).

/** The board's date — «1 أكتوبر» — day and month in the org's zone, Western digits; the full instant on hover and in
 *  `dateTime`. */
function DayMonth({ iso, timeZone, locale }: { iso: string; timeZone: string; locale: string }) {
  const day = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { day: "numeric", month: "long", timeZone }).format(new Date(iso));
  return (
    <time dateTime={iso} title={formatDateTime(iso, timeZone, locale)}>
      <bdi>{day}</bdi>
    </time>
  );
}

type Face = { avatarUrl: string | null; teamColor: string | null | undefined };

export interface IssuanceProps {
  locale: string;
  sessionId: string;
  sessionTitle: string;
  timeZone: string;
  showHeld: boolean;
  held: SessionCertificateRow[];
  issued: SessionCertificateRow[];
  revoked: SessionCertificateRow[];
  faces: Record<string, Face>;
  /** How many issued rows to show before «N أخرى · المزيد»; `null` shows them all. */
  issuedLimit: number | null;
  path: string;
}

export function Issuance({ locale, sessionId, sessionTitle, timeZone, showHeld, held, issued, revoked, faces, issuedLimit, path }: IssuanceProps) {
  const t = useTranslations("certificates.session");
  // The board's short kind — «حضور», not «شهادة حضور» (`templates.card.kind`, read).
  const tk = useTranslations("templates.card.kind");
  const ui = useTranslations("ui");
  const toast = useToast();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const bdi = (c: React.ReactNode) => <bdi>{c}</bdi>;

  // Only ids still held count: a revalidated list may have issued some.
  const heldIds = new Set(held.map((c) => c.id));
  const selection = selected.filter((id) => heldIds.has(id));

  const release = (ids: string[]) =>
    start(async () => {
      const result = await releaseHeld(locale, sessionId, ids);
      if (result.status === "ok") {
        const count = result.count ?? 0;
        toast.show({ tone: "success", title: t("released", { count, value: formatNumber(count) }) });
        setSelected([]);
        setConfirm(null);
      } else {
        toast.show({ tone: "error", title: t(result.status === "not_authorized" ? "notAuthorized" : "failed") });
      }
    });

  const retry = (row: SessionCertificateRow) => {
    if (!row.failedArtifactId) return;
    const artifactId = row.failedArtifactId;
    setRetrying(row.id);
    start(async () => {
      const result = await retryCertificateRender(locale, sessionId, artifactId);
      toast.show(result.status === "ok" ? { tone: "success", title: t("retried") } : { tone: "error", title: t("retryFailed") });
      setRetrying(null);
    });
  };

  const member: DataTableColumn<SessionCertificateRow> = {
    key: "name",
    header: t("columns.name"),
    cell: (c) => (
      <span className="flex items-center gap-2">
        <Avatar memberId={c.memberId} displayName={c.recipientName} src={faces[c.memberId]?.avatarUrl ?? null} teamColor={faces[c.memberId]?.teamColor} size={32} decorative />
        <bdi className="text-fg-heading">{c.recipientName}</bdi>
      </span>
    ),
  };
  const kind: DataTableColumn<SessionCertificateRow> = { key: "kind", header: t("columns.kind"), cell: (c) => tk(c.kind), onCard: true };
  // `dir="ltr"` inside `<bdi>`: a serial is a Latin-and-digit string and reorders against its Arabic neighbours without both.
  const serial: DataTableColumn<SessionCertificateRow> = {
    key: "serial",
    header: t("columns.serial"),
    onCard: true,
    cell: (c) => (
      <bdi dir="ltr" className="break-all">
        {c.serial}
      </bdi>
    ),
  };

  const fileCell = (c: SessionCertificateRow, status: CertificateRenderStatus) => {
    if (c.downloadHref) {
      return (
        // ★ A 36 px target (SC 2.5.8); the visible «PDF» begins its accessible name (SC 2.5.3).
        <a href={c.downloadHref} className={buttonClass("secondary", "sm")} data-download-target="">
          {t.rich("downloadOne", { name: c.recipientName, bdi, hidden: (chunk) => <span className="sr-only">{chunk}</span> })}
        </a>
      );
    }
    if (status === "failed" && c.failedArtifactId) {
      return (
        <Button type="button" variant="ghost" size="sm" pending={pending && retrying === c.id} disabled={pending && retrying !== c.id} onClick={() => retry(c)}>
          {t("retry")}
        </Button>
      );
    }
    return (
      <Badge size="sm" outline>
        {t("pending")}
      </Badge>
    );
  };

  const attendance = { label: t("attendanceLink"), href: `/app/admin/sessions/${sessionId}/attendance` };
  const shownIssued = issuedLimit === null ? issued : issued.slice(0, issuedLimit);
  const hiddenIssued = issued.length - shownIssued.length;

  return (
    <div className="flex flex-col gap-8">
      {showHeld ? (
        <section aria-labelledby="cert-held" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="cert-held" className="text-label text-fg-muted">
              {t.rich("heldHeading", { value: formatNumber(held.length), bdi })}
            </h3>
            {held.length ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={selection.length === 0 || pending} onClick={() => setConfirm(selection)}>
                  {t("releaseSelected")}
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => setConfirm(held.map((c) => c.id))}>
                  {t("releaseAll")}
                </Button>
              </div>
            ) : null}
          </div>
          {/* DEC-NEXT-25: nothing held is the heading and its 0 — never a sentence. */}
          {held.length === 0 ? null : (
            <DataTable
              label={t("heldLabel")}
              rows={held}
              rowKey={(c) => c.id}
              columns={[
                member,
                kind,
                serial,
                {
                  key: "actions",
                  header: t("columns.actions"),
                  onCard: true,
                  align: "end",
                  cell: (c) => (
                    <Button type="button" size="sm" variant="secondary" aria-label={`${t("releaseOne")} — ${c.recipientName}`} disabled={pending} onClick={() => setConfirm([c.id])}>
                      {t("releaseOne")}
                    </Button>
                  ),
                },
              ]}
              selection={{
                selected: selection,
                onChange: setSelected,
                label: (count) => t("selected", { count, value: formatNumber(count) }),
                actions: null,
              }}
              empty={{ title: t("heldEmptyTitle"), action: attendance }}
            />
          )}
        </section>
      ) : null}

      <section aria-labelledby="cert-issued" className="flex flex-col gap-3">
        <h3 id="cert-issued" className="text-label text-fg-muted">
          {t.rich("issuedHeading", { value: formatNumber(issued.length), bdi })}
        </h3>
        {issued.length === 0 ? null : (
          <DataTable
            label={t("issuedLabel")}
            rows={shownIssued}
            rowKey={(c) => c.id}
            columns={[
              member,
              kind,
              serial,
              {
                key: "issuedAt",
                header: t("columns.issuedAt"),
                onCard: true,
                cell: (c) => (c.issuedAt ? <DayMonth iso={c.issuedAt} timeZone={timeZone} locale={locale} /> : null),
              },
              {
                key: "actions",
                header: t("columns.actions"),
                onCard: true,
                align: "end",
                cell: (c) => (
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    {fileCell(c, c.renderStatus)}
                    <Link href={`${path}?revoke=${c.id}#cert-revoke`} className={buttonClass("quiet", "sm", "text-error")} aria-label={`${t("revokeOne")} — ${c.recipientName}`}>
                      {t("revokeOne")}
                    </Link>
                  </span>
                ),
              },
            ]}
            empty={{ title: t("issuedEmptyTitle"), action: attendance }}
          />
        )}
        {hiddenIssued > 0 ? (
          <Link href={`${path}?issued=all#cert-issued`} className="self-start text-body-sm text-fg-heading underline underline-offset-4">
            {t("more", { count: hiddenIssued, value: formatNumber(hiddenIssued) })}
          </Link>
        ) : null}
      </section>

      {revoked.length ? (
        <section aria-labelledby="cert-revoked" className="flex flex-col gap-3">
          <h3 id="cert-revoked" className="text-label text-fg-muted">
            {t.rich("revokedHeading", { value: formatNumber(revoked.length), bdi })}
          </h3>
          <DataTable
            label={t("revokedLabel")}
            rows={revoked}
            rowKey={(c) => c.id}
            columns={[
              member,
              kind,
              serial,
              {
                key: "revokedAt",
                header: t("columns.revokedAt"),
                onCard: true,
                cell: (c) => (c.revokedAt ? <DayMonth iso={c.revokedAt} timeZone={timeZone} locale={locale} /> : null),
              },
              // The org's own screen shows the reason; /verify never does (REQ-CRT-011, OQ-015).
              { key: "reason", header: t("columns.reason"), onCard: true, cell: (c) => (c.revocationReason ? <bdi>{c.revocationReason}</bdi> : null) },
            ]}
            empty={{ title: t("revokedEmptyTitle"), action: attendance }}
          />
        </section>
      ) : null}

      <Dialog open={confirm !== null} onOpenChange={(open) => !pending && !open && setConfirm(null)}>
        {confirm ? (
          <DialogContent title={t("releaseTitle", { count: confirm.length, value: formatNumber(confirm.length) })} description={t("releaseBody")} closeLabel={ui("dialog.close")}>
            <p className="text-body-sm text-fg-body">{t.rich("sessionLine", { title: sessionTitle, bdi })}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="button" size="md" pending={pending} onClick={() => release(confirm)}>
                {t("release")}
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="md" disabled={pending}>
                  {t("cancel")}
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
