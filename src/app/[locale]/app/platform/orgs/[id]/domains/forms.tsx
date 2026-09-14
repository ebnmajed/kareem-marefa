"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { DomainState } from "./actions";
import { emptyDomainState } from "./state";

// SCR-082's two forms. Both are small, both are Latin-valued, and both keep
// `dir="ltr"` on the input alone so the label and the error stay in the page's
// direction.

const FIELD = "mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading";

function Feedback({ state, okKey }: { state: DomainState; okKey: string }) {
  const tErr = useTranslations("platform.errors");
  const t = useTranslations("platform.domains");
  if (state.error) {
    return (
      <p role="alert" className="mt-3 rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
        {tErr(state.error)}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="mt-3 text-body-sm text-fg-muted">
        {t(okKey)}
      </p>
    );
  }
  return null;
}

export function AddDomainForm({ action }: { action: (prev: DomainState, formData: FormData) => Promise<DomainState> }) {
  const t = useTranslations("platform.domains");
  const [state, formAction, pending] = useActionState(action, emptyDomainState);

  return (
    <form action={formAction} className="mt-4 max-w-xl">
      <label htmlFor="domain" className="text-label text-fg-heading">
        {t("domainLabel")}
      </label>
      <input id="domain" name="domain" required dir="ltr" autoComplete="off" spellCheck={false} maxLength={253} className={`${FIELD} font-mono`} />
      <p className="mt-1 text-body-sm text-fg-muted">{t("domainHint")}</p>
      <Feedback state={state} okKey="saved" />
      <Button type="submit" disabled={pending} className="mt-4">
        {t("add")}
      </Button>
    </form>
  );
}

export function FirstAdminForm({
  current,
  action,
}: {
  current: string | null;
  action: (prev: DomainState, formData: FormData) => Promise<DomainState>;
}) {
  const t = useTranslations("platform.domains");
  const [state, formAction, pending] = useActionState(action, emptyDomainState);

  return (
    <form action={formAction} className="mt-4 max-w-xl">
      <p className="text-body-sm text-fg-muted">
        {t("firstAdminCurrent")}
        {": "}
        {current ? <bdi dir="ltr">{current}</bdi> : t("firstAdminNone")}
      </p>
      <label htmlFor="first-admin" className="mt-4 block text-label text-fg-heading">
        {t("firstAdminLabel")}
      </label>
      <input
        id="first-admin"
        name="email"
        type="email"
        required
        dir="ltr"
        defaultValue={current ?? ""}
        maxLength={254}
        className={FIELD}
      />
      <Feedback state={state} okKey="saved" />
      <Button type="submit" disabled={pending} className="mt-4">
        {t("setFirstAdmin")}
      </Button>
    </form>
  );
}
