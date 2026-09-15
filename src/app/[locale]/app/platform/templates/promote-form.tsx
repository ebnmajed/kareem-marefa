"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { LibraryState } from "./actions";
import { emptyLibraryState } from "./state";

// SCR-083's promotion control — REQ-DSG-008.
//
// A disclosure per candidate rather than one form with a picker: the optional
// name belongs to the version being promoted, and a shared field beside a
// select is the shape where an operator renames the wrong one.

const FIELD = "mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading";

export function PromoteForm({
  action,
  disabled,
}: {
  action: (prev: LibraryState, formData: FormData) => Promise<LibraryState>;
  disabled: boolean;
}) {
  const t = useTranslations("platform.templates");
  const tErr = useTranslations("platform.errors");
  const [state, formAction, pending] = useActionState(action, emptyLibraryState);

  return (
    <form action={formAction} className="mt-3">
      {state.error ? (
        <p role="alert" className="mb-3 rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
          {tErr(state.error)}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="mb-3 text-body-sm text-fg-muted">
          {t("promoted")}
        </p>
      ) : null}
      <label htmlFor="promote-name" className="text-label text-fg-heading">
        {t("promoteNameLabel")}
      </label>
      <input id="promote-name" name="name" maxLength={120} className={FIELD} />
      <p className="mt-1 text-body-sm text-fg-muted">{t("promoteNameHint")}</p>
      <Button type="submit" variant="secondary" disabled={pending || disabled} className="mt-4">
        {t("promote")}
      </Button>
    </form>
  );
}
