"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { OrgFormState } from "./actions";
import { emptyOrgFormState } from "./state";

// SCR-080's per-row controls: suspend, reinstate, delete. REQ-TEN-006,
// REQ-NFR-014.
//
// Both destructive controls sit inside a `<details>` disclosure rather than a
// modal. A dialog would need focus management and an escape route on a screen
// where the real safety is elsewhere: suspension asks for a reason the org's
// admins will read, and deletion asks for the org's slug typed back and
// compared **on the server**. A disclosure is keyboard-operable, needs no
// JavaScript to open, and cannot trap anyone at 390 px.
//
// Suspension and deletion are deliberately not the same shape (`REQ-NFR-014`):
// one is reversible and asks for a sentence, the other is not and asks the
// reader to prove they know which org they are looking at.

const FIELD = "mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading";
const SUMMARY = "cursor-pointer list-none text-label text-fg-body underline underline-offset-4 hover:text-fg-heading";

function Alert({ error }: { error: string | null }) {
  const t = useTranslations("platform.errors");
  if (!error) return null;
  return (
    <p role="alert" className="mt-3 rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
      {t(error)}
    </p>
  );
}

export function SuspendControl({
  slug,
  action,
}: {
  slug: string;
  action: (prev: OrgFormState, formData: FormData) => Promise<OrgFormState>;
}) {
  const t = useTranslations("platform.orgs");
  const [state, formAction, pending] = useActionState(action, emptyOrgFormState);

  return (
    <details className="mt-3">
      <summary className={SUMMARY}>{t("suspendTitle")}</summary>
      <form action={formAction} className="mt-3 max-w-xl">
        <p className="text-body-sm text-fg-muted">{t("suspendHint")}</p>
        <Alert error={state.error} />
        <label htmlFor={`suspend-${slug}`} className="mt-4 block text-label text-fg-heading">
          {t("suspendReasonLabel")}
        </label>
        <input id={`suspend-${slug}`} name="reason" required minLength={3} maxLength={300} className={FIELD} />
        <Button type="submit" disabled={pending} className="mt-4">
          {t("suspend")}
        </Button>
      </form>
    </details>
  );
}

export function DeleteControl({
  slug,
  action,
}: {
  slug: string;
  action: (prev: OrgFormState, formData: FormData) => Promise<OrgFormState>;
}) {
  const t = useTranslations("platform.orgs");
  const [state, formAction, pending] = useActionState(action, emptyOrgFormState);

  return (
    <details className="mt-3">
      <summary className={SUMMARY}>{t("deleteTitle")}</summary>
      <form action={formAction} className="mt-3 max-w-xl">
        <p className="text-body-sm text-fg-muted">{t("deleteHint")}</p>
        {state.ok ? (
          <p role="status" className="mt-3 rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
            {t("deleteQueued")}
          </p>
        ) : null}
        <Alert error={state.error} />
        <label htmlFor={`confirm-${slug}`} className="mt-4 block text-label text-fg-heading">
          {/* The slug is Latin inside an Arabic sentence: bidi-isolated, or the
              punctuation around it reorders. */}
          {t.rich("deleteConfirmLabel", { slug, bdi: (c) => <bdi dir="ltr">{c}</bdi> })}
        </label>
        {/* A slug is lowercase Latin and types left to right whatever the page
            direction; autocomplete off because a browser offering a previously
            typed slug would undo the point of typing it. */}
        <input
          id={`confirm-${slug}`}
          name="confirmSlug"
          required
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          className={`${FIELD} font-mono`}
        />
        <Button type="submit" variant="secondary" disabled={pending} className="mt-4">
          {t("delete")}
        </Button>
      </form>
    </details>
  );
}
