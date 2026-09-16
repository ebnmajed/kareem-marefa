"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import type { DataTableColumn } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import type { RemoveDomainResult } from "./state";

// SCR-082's allowed domains on `ui/data-table` — REQ-TEN-007, REQ-UIX-013.
//
// Removing a domain confirms in `ui/dialog` NAMING the domain and saying, before
// the press, the thing an operator most often gets wrong: it stops NEW
// memberships only, and nobody loses access. A domain is Latin and types left to
// right, so it is isolated in its own `ltr` box wherever it appears.

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
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      const { error } = await remove(domain);
      setOpen(false);
      toast.show(error ? { title: tErr(error), tone: "error" } : { title: t("removed", { domain: isolate(domain) }), tone: "success" });
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="secondary" size="sm" aria-label={t("removeFor", { domain })} onClick={() => setOpen(true)}>
        {t("remove")}
      </Button>
      <DialogContent
        title={t.rich("removeConfirmTitle", { domain, bdi: (c) => <bdi dir="ltr">{c}</bdi> })}
        description={t("removeConfirmBody")}
        closeLabel={tOrgs("closeDialog")}
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

export function DomainsTable({ domains, remove }: { domains: string[]; remove: (domain: string) => Promise<RemoveDomainResult> }) {
  const t = useTranslations("platform.domains");

  const columns: DataTableColumn<DomainRow>[] = [
    {
      key: "domain",
      header: t("domainColumn"),
      cell: (row) => (
        <span dir="ltr" className="font-mono text-fg-heading">
          <bdi>{row.domain}</bdi>
        </span>
      ),
    },
    { key: "actions", header: t("actionsColumn"), onCard: true, cell: (row) => <RemoveDomain domain={row.domain} remove={remove} /> },
  ];

  return (
    <DataTable
      label={t("domainsTitle")}
      columns={columns}
      rows={domains.map((domain) => ({ domain }))}
      rowKey={(row) => row.domain}
      empty={{ title: t("empty"), action: { label: t("emptyAction"), onClick: () => document.getElementById("domain")?.focus() }, size: "sm" }}
    />
  );
}
