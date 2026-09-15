"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { OrgFormState } from "../actions";
import { emptyOrgFormState } from "../state";

// SCR-081's form — REQ-TEN-002, REQ-TEN-004, REQ-TEN-007.
//
// Four of the six fields are Latin by nature: a slug, a certificate prefix, a
// list of domains and an email address. Each carries `dir="ltr"` on the input
// alone, so the label, the hint and the error stay in the page's direction and
// only the typed value flips. Setting `dir` on the wrapper instead is the
// common mistake — it drags the label with it.

const FIELD = "mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading";
const HINT = "mt-1 text-body-sm text-fg-muted";

export function NewOrgForm({ action }: { action: (prev: OrgFormState, formData: FormData) => Promise<OrgFormState> }) {
  const t = useTranslations("platform.newOrg");
  const tErr = useTranslations("platform.errors");
  const [state, formAction, pending] = useActionState(action, emptyOrgFormState);

  return (
    <form action={formAction} className="mt-6 max-w-2xl space-y-7">
      {state.error ? (
        <p role="alert" className="rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
          {tErr(state.error)}
        </p>
      ) : null}

      <div>
        <label htmlFor="org-name" className="text-label text-fg-heading">
          {t("nameLabel")}
        </label>
        <input id="org-name" name="name" required minLength={2} maxLength={120} className={FIELD} />
        <p className={HINT}>{t("nameHint")}</p>
      </div>

      <div>
        <label htmlFor="org-slug" className="text-label text-fg-heading">
          {t("slugLabel")}
        </label>
        <input
          id="org-slug"
          name="slug"
          required
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          maxLength={60}
          className={`${FIELD} font-mono`}
        />
        <p className={HINT}>{t("slugHint")}</p>
      </div>

      <div>
        <label htmlFor="org-prefix" className="text-label text-fg-heading">
          {t("prefixLabel")}
        </label>
        <input
          id="org-prefix"
          name="certificatePrefix"
          required
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          pattern="[A-Za-z]{2,5}"
          maxLength={5}
          className={`${FIELD} w-32 font-mono uppercase`}
        />
        <p className={HINT}>{t("prefixHint")}</p>
      </div>

      <div>
        <label htmlFor="org-domains" className="text-label text-fg-heading">
          {t("domainsLabel")}
        </label>
        <textarea id="org-domains" name="domains" required dir="ltr" rows={3} spellCheck={false} className={`${FIELD} font-mono`} />
        <p className={HINT}>{t("domainsHint")}</p>
      </div>

      <div>
        <label htmlFor="org-admin" className="text-label text-fg-heading">
          {t("firstAdminLabel")}
        </label>
        <input id="org-admin" name="firstAdminEmail" type="email" required dir="ltr" maxLength={254} className={FIELD} />
        <p className={HINT}>{t("firstAdminHint")}</p>
      </div>

      <div className="flex items-start gap-3">
        <input
          id="org-seed"
          name="seedCategories"
          type="checkbox"
          defaultChecked
          className="mt-1 size-5 shrink-0 rounded-sm border border-edge-strong"
        />
        <div>
          <label htmlFor="org-seed" className="text-label text-fg-heading">
            {t("seedLabel")}
          </label>
          <p className={HINT}>{t("seedHint")}</p>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
