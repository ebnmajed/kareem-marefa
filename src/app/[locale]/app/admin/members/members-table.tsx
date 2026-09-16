"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@/components/sessions/numerals";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Link } from "@/components/ui/link";
import { Menu } from "@/components/ui/menu";
import { MoreIcon } from "@/components/ui/icons";
import { usePendingNudge } from "@/components/ui/pending-nudge";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import type { AdminMemberRow } from "@/lib/dal/admin-members";
import type { RowState } from "./actions";
import { emptyRowState } from "./state";

// SCR-049 · /app/admin/members, onto `ui/data-table` for wave 6 (`16` §6.7,
// `DEC-130`) — one of the three lists that most need the phone card stack.
//
// ★ Bound actions are PROPS, not imports: `./actions.ts` transitively pulls
// in `lib/dal/admin-members.ts`, which starts `import "server-only"` — that
// throws the instant this "use client" module (or its own test) imports it,
// even just to reference a name. `page.tsx` (server) binds each action per
// row and hands the bound function down, the same shape `sessions-table.
// tsx`'s `runTransitionAction` already established for the identical reason.
//
// `src` stays `null` on every `Avatar` this wave, per the spawn note: avatar
// storage (`16` §6.8, `REQ-PRF-008`…`011`) is a different track's story, not
// this one. Every row still gets its initials-and-tint fallback for free —
// that IS `Avatar`'s default rendering, not a special case here.
//
// No `rowHref`: the row hosts a `<Select>` and a `Menu`, so a whole-row link
// would be a nested-interactive-inside-clickable-row trap — the name cell's
// own "عرض الملف الكامل" link is the one way in. No `selection`/bulk bar
// either: nothing backs a bulk role-change or a bulk deactivate that would
// share one typed reason across several members.

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function RoleCell({ member, action, isSelf }: { member: AdminMemberRow; action: (prev: RowState, fd: FormData) => Promise<RowState>; isSelf: boolean }) {
  const t = useTranslations("admin.members");
  const toast = useToast();
  const [state, formAction, pending] = useActionState(action, emptyRowState);
  // ★ DEC-135: a role change re-renders this row's own cell — exactly the
  // shape React 19.2.4 can lose the retry for; a workaround, not a feature,
  // delete with `pending-nudge.ts`.
  usePendingNudge(pending);

  useEffect(() => {
    if (state.done) toast.show({ title: t("roleChanged"), tone: "success" });
    else if (state.error) toast.show({ title: t(`error.${state.error}`), tone: "error" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `toast`/`t` are stable; re-running on them would re-fire the same acknowledgement.
  }, [state]);

  if (isSelf) {
    return <span className="text-fg-body">{t(`role.${member.role}`)}</span>;
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <Select name="role" aria-label={t("roleLabel")} defaultValue={member.role} disabled={pending} className="h-9 w-auto text-body-sm">
        <option value="admin">{t("role.admin")}</option>
        <option value="moderator">{t("role.moderator")}</option>
        <option value="member">{t("role.member")}</option>
      </Select>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {t("changeRole")}
      </Button>
    </form>
  );
}

function ActionsCell({
  member,
  deactivateAction,
  onReactivate,
  isSelf,
  label,
}: {
  member: AdminMemberRow;
  deactivateAction: (prev: RowState, fd: FormData) => Promise<RowState>;
  onReactivate: () => Promise<void>;
  isSelf: boolean;
  label: string;
}) {
  const t = useTranslations("admin.members");
  const toast = useToast();
  const [state, formAction, pending] = useActionState(deactivateAction, emptyRowState);
  // ★ DEC-135: deactivating re-renders this row (the status badge, the
  // deactivation note, the menu collapsing to a single reactivate control) —
  // exactly the shape React 19.2.4 can lose the retry for; a workaround, not
  // a feature, delete with `pending-nudge.ts`. Both this action's own
  // `pending` and `reactivatePending` below wait on server content, so both
  // get it — `onReactivate` is a bound Server Action too, just called
  // manually rather than through `useActionState`.
  usePendingNudge(pending);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reactivatePending, setReactivatePending] = useState(false);
  usePendingNudge(reactivatePending);

  // ★ Closing the dialog is DERIVED from `state`, adjusted DURING RENDER
  // (react.dev's own pattern for this, and what `ui/combobox.tsx` already
  // does for an identical reason) — not a `setState` call inside the
  // `useEffect` below, which `react-hooks/set-state-in-effect` refuses. The
  // toast stays in the effect: showing it is a genuine side effect (an
  // imperative call to an external system), not a state adjustment.
  const [lastHandledState, setLastHandledState] = useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state.done) setConfirmOpen(false);
  }

  useEffect(() => {
    if (state.done) toast.show({ title: t("deactivateDone"), tone: "success" });
    else if (state.error) toast.show({ title: t(`error.${state.error}`), tone: "error" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `toast`/`t` are stable; re-running on them would re-fire the same acknowledgement.
  }, [state]);

  async function handleReactivate() {
    setReactivatePending(true);
    try {
      await onReactivate();
      toast.show({ title: t("reactivateDone"), tone: "success" });
    } finally {
      setReactivatePending(false);
    }
  }

  if (isSelf) return null;

  if (member.status === "deactivated") {
    return (
      <IconButton label={`${t("reactivate")} — ${member.displayName ?? member.email}`} size="sm" pending={reactivatePending} onClick={handleReactivate}>
        <MoreIcon />
      </IconButton>
    );
  }

  return (
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <Menu
        align="end"
        trigger={
          <IconButton label={label} size="sm">
            <MoreIcon />
          </IconButton>
        }
        items={[{ label: t("deactivate"), onSelect: () => setConfirmOpen(true), tone: "error" }]}
      />
      <DialogContent
        title={t.rich("deactivateConfirmTitle", { name: member.displayName ?? member.email, t: (chunks) => <bdi>{chunks}</bdi> })}
        closeLabel={t("closeDialog")}
      >
        <form action={formAction}>
          <Field id={`deactivate-reason-${member.id}`} label={t("reasonLabel")} hint={t("reasonHint")} required error={state.error === "reason_required" ? t("error.reason_required") : undefined}>
            <Textarea name="reason" rows={3} maxLength={300} />
          </Field>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="submit" variant="danger" disabled={pending}>
              {t("send")}
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

export function MembersTable({
  members,
  companyNames,
  selfId,
  timeZone,
  locale,
  changeRoleActions,
  deactivateActions,
  reactivateActions,
}: {
  members: AdminMemberRow[];
  companyNames: Map<string, string>;
  selfId: string;
  timeZone: string;
  locale: string;
  /** Each a `changeRole.bind(null, locale, memberId)` etc., bound ONCE per
   *  row in `page.tsx` and handed down as maps — never a factory function
   *  returning a bound action. A factory is a plain closure crossing the
   *  server/client boundary as a prop, which React Flight cannot serialise
   *  (only an actual bound Server Action reference survives the crossing) —
   *  `sessions-table.tsx`'s own `transitionActions` carries the full
   *  reasoning, found and fixed here for the same shape at the same time. */
  changeRoleActions: Record<string, (prev: RowState, fd: FormData) => Promise<RowState>>;
  deactivateActions: Record<string, (prev: RowState, fd: FormData) => Promise<RowState>>;
  reactivateActions: Record<string, () => Promise<void>>;
}) {
  const t = useTranslations("admin.members");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return members;
    return members.filter((m) => normalize(m.displayName ?? "").includes(needle) || normalize(m.email).includes(needle));
  }, [members, query]);

  const columns: DataTableColumn<AdminMemberRow>[] = [
    {
      key: "member",
      header: t("columnMember"),
      onCard: true,
      cell: (m) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar memberId={m.id} displayName={m.displayName} src={null} size={32} decorative />
          <div className="min-w-0">
            <p className="text-label text-fg-heading">
              <bdi>{m.displayName ?? m.email}</bdi>
            </p>
            {/* ★ REQ-ADM-009: the admin sees every member's email — a real
                build's own run found it missing entirely once `displayName`
                is set, since it only ever appeared as THAT field's fallback.
                A second, always-visible line, matching the deleted
                `member-row.tsx`'s own shape — `dir="ltr"` because an email
                stays Latin-script regardless of locale. */}
            <p className="mt-0.5 text-caption text-fg-muted">
              <bdi dir="ltr">{m.email}</bdi>
            </p>
            <Link href={`/app/members/${m.id}`} quiet className="text-caption text-fg-muted underline underline-offset-4 hover:text-fg-heading">
              {t("viewProfile")}
            </Link>
            {m.status === "deactivated" && m.deactivatedAt ? (
              <p className="mt-1 text-caption text-fg-muted">
                {t.rich("deactivatedNote", {
                  date: formatDateTime(m.deactivatedAt, timeZone, locale),
                  reason: m.deactivatedReason ?? "",
                  bdi: (chunks) => <bdi>{chunks}</bdi>,
                })}
              </p>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "company",
      header: t("columnCompany"),
      onCard: true,
      cell: (m) => (m.companyId ? <bdi>{companyNames.get(m.companyId) ?? ""}</bdi> : <span className="text-fg-muted">—</span>),
    },
    {
      key: "role",
      header: t("columnRole"),
      onCard: true,
      cell: (m) => <RoleCell member={m} action={changeRoleActions[m.id]} isSelf={m.id === selfId} />,
    },
    {
      key: "status",
      header: t("columnStatus"),
      onCard: true,
      cell: (m) => (
        <Badge tone={m.status === "active" ? "success" : "neutral"} outline={m.status !== "active"} size="sm">
          {t(m.status === "active" ? "statusActive" : "statusDeactivated")}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: t("columnActions"),
      align: "end",
      cell: (m) => (
        <ActionsCell
          member={m}
          deactivateAction={deactivateActions[m.id]}
          onReactivate={reactivateActions[m.id]}
          isSelf={m.id === selfId}
          label={t.markup("moreActions", { name: m.displayName ?? m.email, t: (chunks) => chunks })}
        />
      ),
    },
  ];

  return (
    <div>
      <Field id="members-search" label={t("searchLabel")} className="max-w-sm">
        <Input type="search" placeholder={t("searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
      </Field>
      <DataTable
        className="mt-4"
        label={t("tableLabel")}
        columns={columns}
        rows={filtered}
        rowKey={(m) => m.id}
        empty={{ title: t("searchEmpty"), action: { label: t("searchLabel"), onClick: () => setQuery("") } }}
      />
    </div>
  );
}
