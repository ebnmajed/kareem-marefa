"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { CertificateRenderStatus, SessionCertificateRow } from "@/lib/dal/certificates";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DataTableColumn } from "@/components/ui";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { SectionHeader } from "@/components/ui/section-header";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { releaseHeld, retryCertificateRender, revokeIssued } from "@/app/[locale]/app/admin/sessions/[id]/certificates/actions";

// SCR-045's «الإصدار» — REQ-CRT-004, REQ-CRT-011, REQ-DSG-031, D50.
//
// Three tables, one per state, because the three states ask three different
// things of the admin: a held certificate is waiting for a decision, an
// issued one can only be revoked, and a revoked one is a record with its
// reason. One table with a state column would put «أطلِق» and «ألغِ» in the
// same row menu and make the difference a matter of reading the badge.
//
// ★ EVERY WRITE ANSWERS WITH A RESULT AND THE CONTROL TOASTS IT, from inside
// the transition — never from an effect watching state, which unmounts with
// the row the revalidation removes (the wave-6 trap). Released and revoked
// rows move tables on the revalidated render; the toast is already shown.
//
// ★ REQ-UIX-013: release confirms with the count and the session, and says
// what cannot be undone; revocation confirms by name, and the reason is
// written INSIDE the confirm, so there is one step and not two. The form is
// `noValidate`: the reason's refusal is ours, at the field, not a browser
// bubble that swallows the click before it becomes a request.
//
// ★ A FAILED RENDER IS RETRIED PER CERTIFICATE (REQ-DSG-031). Tier A failing
// an export is the guard working (REQ-DSG-014); the row says so and offers the
// one retry, and the serial is untouched — it was spent at issue.
//
// The reason is shown on the revoked table because this screen is the org's
// own; /verify never shows it (OQ-015, REQ-CRT-011).

export interface CertificateIssuanceProps {
  locale: string;
  sessionId: string;
  sessionTitle: string;
  timeZone: string;
  mode: "off" | "automatic" | "review";
  held: SessionCertificateRow[];
  issued: SessionCertificateRow[];
  revoked: SessionCertificateRow[];
}

const RENDER_TONE: Record<CertificateRenderStatus, "neutral" | "info" | "success" | "error"> = {
  none: "neutral",
  queued: "neutral",
  rendering: "info",
  ready: "success",
  failed: "error",
};

export function CertificateIssuance({ locale, sessionId, sessionTitle, timeZone, mode, held, issued, revoked }: CertificateIssuanceProps) {
  const t = useTranslations("certificates.session");
  const tk = useTranslations("certificates.kind");
  const ui = useTranslations("ui");
  const toast = useToast();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [revoking, setRevoking] = useState<SessionCertificateRow | null>(null);
  const [reasonError, setReasonError] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  // Only ids still held count: a revalidated list may have released some.
  const heldIds = new Set(held.map((c) => c.id));
  const selection = selected.filter((id) => heldIds.has(id));

  const release = () =>
    start(async () => {
      const result = await releaseHeld(locale, sessionId, selection);
      if (result.status === "ok") {
        const count = result.count ?? 0;
        toast.show({
          tone: "success",
          title: t("released", { count, value: formatNumber(count) }),
        });
        setSelected([]);
        setReleaseOpen(false);
      } else {
        toast.show({
          tone: "error",
          title: t(result.status === "not_authorized" ? "notAuthorized" : "failed"),
        });
      }
    });

  const revoke = (form: FormData) => {
    const target = revoking;
    if (!target) return;
    start(async () => {
      const result = await revokeIssued(locale, sessionId, target.id, form);
      if (result.status === "ok") {
        toast.show({ tone: "success", title: t("revokeDone") });
        setRevoking(null);
        setReasonError(false);
      } else if (result.status === "reason_required") {
        setReasonError(true);
      } else {
        toast.show({
          tone: "error",
          title: t(result.status === "not_authorized" ? "notAuthorized" : "failed"),
        });
      }
    });
  };

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

  const name: DataTableColumn<SessionCertificateRow> = {
    key: "name",
    header: t("columns.name"),
    cell: (c) => <bdi className="text-fg-heading">{c.recipientName}</bdi>,
  };
  const kind: DataTableColumn<SessionCertificateRow> = {
    key: "kind",
    header: t("columns.kind"),
    cell: (c) => tk(c.kind),
    onCard: true,
  };
  // `dir="ltr"` inside `<bdi>`: a serial is a Latin-and-digit string and
  // reorders against its Arabic neighbours without both.
  const serial: DataTableColumn<SessionCertificateRow> = {
    key: "serial",
    header: t("columns.serial"),
    cell: (c) => (
      <bdi dir="ltr" className="break-all">
        {c.serial}
      </bdi>
    ),
    onCard: true,
  };
  const render: DataTableColumn<SessionCertificateRow> = {
    key: "render",
    header: t("columns.render"),
    onCard: true,
    cell: (c) => (
      <span className="flex flex-wrap items-center gap-2">
        <Badge size="sm" tone={RENDER_TONE[c.renderStatus]} outline={c.renderStatus === "none" || c.renderStatus === "queued"}>
          {t(`render.${c.renderStatus}`)}
        </Badge>
        {c.renderStatus === "failed" && c.failedArtifactId ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            pending={pending && retrying === c.id}
            disabled={pending && retrying !== c.id}
            onClick={() => retry(c)}
          >
            {t("retry")}
          </Button>
        ) : null}
      </span>
    ),
  };

  return (
    <div className="flex flex-col gap-10">
      {mode === "review" || held.length > 0 ? (
        <section aria-labelledby="cert-held" className="flex flex-col gap-4">
          <SectionHeader as="h3" id="cert-held" title={t("heldLabel")} count={held.length} />
          {held.length === 0 ? (
            <p className="text-body-sm text-fg-muted">{t("heldEmptyDescription")}</p>
          ) : (
            <DataTable
              label={t("heldLabel")}
              rows={held}
              rowKey={(c) => c.id}
              columns={[name, kind, serial, render]}
              selection={{
                selected: selection,
                onChange: setSelected,
                label: (count) => t("selected", { count, value: formatNumber(count) }),
                actions: (
                  <Button type="button" size="sm" disabled={selection.length === 0} onClick={() => setReleaseOpen(true)}>
                    {t("releaseSelected")}
                  </Button>
                ),
              }}
              empty={{
                title: t("heldEmptyTitle"),
                description: t("heldEmptyDescription"),
                action: {
                  label: t("modeLink"),
                  href: `/app/admin/sessions/${sessionId}/schedule`,
                },
              }}
            />
          )}
        </section>
      ) : null}

      <section aria-labelledby="cert-issued" className="flex flex-col gap-4">
        <SectionHeader as="h3" id="cert-issued" title={t("issuedLabel")} count={issued.length} />
        {/* An empty table is a sentence, not an empty state with a button: there
            is nothing to do about «none issued yet» from here. */}
        {issued.length === 0 ? (
          <p className="text-body-sm text-fg-muted">{t("issuedEmptyDescription")}</p>
        ) : (
          <DataTable
            label={t("issuedLabel")}
            rows={issued}
            rowKey={(c) => c.id}
            columns={[
              name,
              kind,
              serial,
              {
                key: "issuedAt",
                header: t("columns.issuedAt"),
                onCard: true,
                cell: (c) => (c.issuedAt ? <bdi>{formatDateTime(c.issuedAt, timeZone, locale)}</bdi> : null),
              },
              render,
              {
                key: "actions",
                header: t("columns.actions"),
                onCard: true,
                align: "end",
                cell: (c) => (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setReasonError(false);
                      setRevoking(c);
                    }}
                  >
                    {t("revoke")}
                  </Button>
                ),
              },
            ]}
            empty={{
              title: t("issuedEmptyTitle"),
              description: t("issuedEmptyDescription"),
              action: {
                label: t("attendanceLink"),
                href: `/app/admin/sessions/${sessionId}/attendance`,
              },
            }}
          />
        )}
      </section>

      <section aria-labelledby="cert-revoked" className="flex flex-col gap-4">
        <SectionHeader as="h3" id="cert-revoked" title={t("revokedLabel")} count={revoked.length} />
        {revoked.length === 0 ? (
          <p className="text-body-sm text-fg-muted">{t("revokedEmptyDescription")}</p>
        ) : (
          <DataTable
            label={t("revokedLabel")}
            rows={revoked}
            rowKey={(c) => c.id}
            columns={[
              name,
              kind,
              serial,
              {
                key: "revokedAt",
                header: t("columns.revokedAt"),
                onCard: true,
                cell: (c) => (c.revokedAt ? <bdi>{formatDateTime(c.revokedAt, timeZone, locale)}</bdi> : null),
              },
              {
                key: "reason",
                header: t("columns.reason"),
                onCard: true,
                cell: (c) => (c.revocationReason ? <bdi>{c.revocationReason}</bdi> : null),
              },
            ]}
            empty={{
              title: t("revokedEmptyTitle"),
              description: t("revokedEmptyDescription"),
              action: {
                label: t("attendanceLink"),
                href: `/app/admin/sessions/${sessionId}/attendance`,
              },
            }}
          />
        )}
      </section>

      <Dialog open={releaseOpen} onOpenChange={(open) => !pending && setReleaseOpen(open)}>
        <DialogContent
          title={t("releaseTitle", {
            count: selection.length,
            value: formatNumber(selection.length),
          })}
          description={t("releaseBody")}
          closeLabel={ui("dialog.close")}
        >
          <p className="text-body-sm text-fg-body">
            {t.rich("sessionLine", {
              title: sessionTitle,
              bdi: (c) => <bdi>{c}</bdi>,
            })}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="button" size="md" pending={pending} disabled={selection.length === 0} onClick={release}>
              {t("release")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md" disabled={pending}>
                {t("cancel")}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={revoking !== null} onOpenChange={(open) => !open && !pending && setRevoking(null)}>
        {revoking ? (
          <DialogContent
            title={t.rich("revokeTitle", {
              name: revoking.recipientName,
              bdi: (c) => <bdi>{c}</bdi>,
            })}
            description={t("revokeBody")}
            closeLabel={ui("dialog.close")}
          >
            <p className="text-body-sm text-fg-body">
              {t.rich("sessionLine", {
                title: sessionTitle,
                bdi: (c) => <bdi>{c}</bdi>,
              })}
              {" · "}
              <bdi dir="ltr">{revoking.serial}</bdi>
            </p>
            {/* `onSubmit`, not `action`: a form action resets its fields when it
                settles, and a refused reason should stay where it was typed. */}
            <form
              noValidate
              className="mt-4 flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                revoke(new FormData(event.currentTarget));
              }}
            >
              <Field id="revoke-reason" label={t("reasonLabel")} hint={t("reasonHint")} error={reasonError ? t("reasonRequired") : undefined} required>
                <Textarea name="reason" rows={3} maxLength={500} onChange={() => reasonError && setReasonError(false)} />
              </Field>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" variant="danger" size="md" pending={pending}>
                  {t("revokeConfirm")}
                </Button>
                <DialogClose asChild>
                  <Button type="button" variant="secondary" size="md" disabled={pending}>
                    {t("cancel")}
                  </Button>
                </DialogClose>
              </div>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
