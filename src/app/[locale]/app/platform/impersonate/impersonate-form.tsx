"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createBrowserClient } from "@/lib/supabase/browser";
import type { ImpersonationState } from "./actions";
import { emptyImpersonationState } from "./state";

// SCR-085's form — REQ-ADM-002, REQ-ADM-019, DEC-014.
//
// ★ WHY THIS IS A CLIENT COMPONENT AT ALL. The claims an impersonation session
// carries are minted by the access-token hook AT ISSUANCE (0006, replaced in
// M8), so a session that has just been created reaches the token on the next
// refresh — up to `jwt_expiry` (900 s) away if nobody asks for one. After the
// action succeeds this calls `supabase.auth.refreshSession()`, which re-runs
// the hook and returns a token carrying the org. That is an AUTH operation,
// which is exactly what the browser client exists for (DEC-020) — no data is
// read or written here.
//
// The race falls the safe way: until the refresh lands the operator is still
// only a platform admin with no org claim, and the org's audit row is already
// written either way.

const FIELD = "mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading";

export interface OrgOption {
  id: string;
  name: string;
  slug: string;
}

export function ImpersonateForm({
  orgs,
  action,
}: {
  orgs: OrgOption[];
  action: (prev: ImpersonationState, formData: FormData) => Promise<ImpersonationState>;
}) {
  const t = useTranslations("platform.impersonate");
  const tErr = useTranslations("platform.errors");
  const [state, formAction, pending] = useActionState(action, emptyImpersonationState);
  const router = useRouter();
  const refreshed = useRef(false);

  useEffect(() => {
    if (!state.started || refreshed.current) return;
    refreshed.current = true;
    // One refresh per started session. A failure here is not an error the
    // operator can act on: the session exists, the org has been told, and the
    // next natural token refresh picks the claims up.
    createBrowserClient()
      .auth.refreshSession()
      .finally(() => router.refresh());
  }, [state.started, router]);

  return (
    <form action={formAction} className="mt-6 max-w-xl">
      {state.error ? (
        <p role="alert" className="rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
          {tErr(state.error)}
        </p>
      ) : null}

      <label htmlFor="imp-org" className="block text-label text-fg-heading">
        {t("orgLabel")}
      </label>
      <select id="imp-org" name="orgId" required defaultValue="" className={FIELD}>
        <option value="" disabled />
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>

      <label htmlFor="imp-reason" className="mt-6 block text-label text-fg-heading">
        {t("reasonLabel")}
      </label>
      <textarea id="imp-reason" name="reason" required minLength={3} maxLength={500} rows={3} className={FIELD} />
      <p className="mt-1 text-body-sm text-fg-muted">{t("reasonHint")}</p>

      <label htmlFor="imp-minutes" className="mt-6 block text-label text-fg-heading">
        {t("minutesLabel")}
      </label>
      {/* 240 is the table's ceiling too (02 §4.1), so a value past it is
          refused by Postgres and not only by this input. */}
      <input
        id="imp-minutes"
        name="minutes"
        type="number"
        inputMode="numeric"
        min={5}
        max={240}
        step={5}
        defaultValue={60}
        dir="ltr"
        className={`${FIELD} w-32 text-center`}
      />

      <Button type="submit" disabled={pending} className="mt-6">
        {t("start")}
      </Button>
    </form>
  );
}
