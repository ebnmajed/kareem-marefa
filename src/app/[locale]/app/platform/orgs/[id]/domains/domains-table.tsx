"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import type { DataTableColumn } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import type { RemoveDomainResult } from "./state";

// SCR-082's list as `PlatformDomains.dc.html` draws it — the domain and «أزل» — on `ui/data-table` (REQ-TEN-007,
// REQ-UIX-013). The board's company, «أُضيف» and members columns are not built (DEC-251, Q7).
//
// Removing confirms in `ui/dialog` NAMING the domain and saying, before the press, the thing an operator most often
// gets wrong: it stops NEW memberships only, and nobody loses access (D6). A domain is Latin and types left to right,
// so it sits in its own isolated `ltr` box wherever it appears.

const isolate = (value: string) => `⁨${value}⁩`;

interface DomainRow {
  domain: string;
}

function RemoveDomain({ domain, remove }: { domain: string; remove: (domain: string) => Promise<RemoveDomainResult> }) {
  const t = useTranslations("platform.domains");
  const tOrgs = useTranslations("platform.orgs");
  const tErr = useTranslations("platform.errors");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  // Focus returns to «أزل» when the confirm closes without removing (Escape, «تراجع»): the dialog is opened by state,
  // so Radix has no trigger of its own to return to (the same defect and fix as 080's row acts).
  const opener = useRef<HTMLButtonElement | null>(null);
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      const { error } = await remove(domain);
      setOpen(false);
      toast.show(error ? { title: tErr(error), tone: "error" } : { title: t("removed", { domain: isolate(domain) }), tone: "success" });
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* A quiet pill, as drawn; 36 px drawn, 44 px hit (the `after:` box). The confirm inside is the danger. */}
      <Button
        type="button"
        variant="quiet"
        size="sm"
        className="relative after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']"
        aria-label={t("removeFor", { domain })}
        onClick={(event) => {
          opener.current = event.currentTarget;
          setOpen(true);
        }}
      >
        {t("remove")}
      </Button>
      <DialogContent
        title={t.rich("removeConfirmTitle", { domain, bdi: (c) => <bdi dir="ltr">{c}</bdi> })}
        description={t("removeConfirmBody")}
        closeLabel={tOrgs("closeDialog")}
        onCloseAutoFocus={(event) => {
          if (!opener.current?.isConnected) return;
          event.preventDefault();
          opener.current.focus();
        }}
      >
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="danger" size="md" pending={pending} onClick={confirm}>
            {t("remove")}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="secondary" size="md">
              {tOrgs("cancel")}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** `remove` absent: a read-only list — the org has a deletion requested (`0097`). */
export function DomainsTable({ domains, remove }: { domains: string[]; remove?: (domain: string) => Promise<RemoveDomainResult> }) {
  const t = useTranslations("platform.domains");

  const columns: DataTableColumn<DomainRow>[] = [
    {
      key: "domain",
      header: t("domainColumn"),
      cell: (row) => (
        <span dir="ltr" className="text-fg-heading">
          <bdi>{row.domain}</bdi>
        </span>
      ),
    },
    ...(remove
      ? [
          {
            key: "actions",
            header: t("actionsColumn"),
            onCard: true,
            align: "end",
            cell: (row: DomainRow) => <RemoveDomain domain={row.domain} remove={remove} />,
          } satisfies DataTableColumn<DomainRow>,
        ]
      : []),
  ];

  return (
    <DataTable
      // The surface card at md+, as every console table since wave 21 draws it; the rows are cards below `md`.
      className="md:rounded-panel md:border md:border-edge md:bg-surface md:px-2 md:py-1"
      hiddenHeaders={["actions"]}
      label={t("domainsTitle")}
      columns={columns}
      rows={domains.map((domain) => ({ domain }))}
      rowKey={(row) => row.domain}
      empty={{ title: t("empty"), action: { label: t("emptyAction"), onClick: () => document.getElementById("domain")?.focus() }, size: "sm" }}
    />
  );
}
