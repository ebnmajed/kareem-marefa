"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { type CreateSessionState } from "./actions";
import { emptyCreateState } from "./state";

// SCR-042's «أنشئ جلسة مباشرة» (REQ-PRO-007).
//
// ★ No date, no venue, no capacity — and not because they are hidden. Creating
// a session and scheduling it are two acts (D13/D14), `create_session()` has
// no parameter for any of them, and `directSessionInput` is `.strict()` so one
// arriving here would be a parse failure.

const FIELD = "mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading";

export function DirectSessionForm({
  action,
  categories,
  members,
}: {
  action: (prev: CreateSessionState, formData: FormData) => Promise<CreateSessionState>;
  categories: { id: string; name: string }[];
  members: { id: string; displayName: string | null }[];
}) {
  const t = useTranslations("admin.sessions");
  const tp = useTranslations("proposals.propose");
  const [state, formAction, pending] = useActionState(action, emptyCreateState);

  return (
    <form action={formAction} className="mt-4 max-w-2xl space-y-6">
      {state.error ? (
        <p role="alert" className="rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
          {t(state.error)}
        </p>
      ) : null}

      <div>
        <label htmlFor="s-title" className="text-label text-fg-heading">
          {t("titleLabel")}
        </label>
        <input id="s-title" name="title" required maxLength={150} className={FIELD} />
      </div>

      <div>
        <label htmlFor="s-abstract" className="text-label text-fg-heading">
          {t("abstractLabel")}
        </label>
        <textarea id="s-abstract" name="abstract" required rows={4} maxLength={2000} className={`${FIELD} min-h-28`} />
      </div>

      <div>
        <label htmlFor="s-category" className="text-label text-fg-heading">
          {t("categoryLabel")}
        </label>
        <select id="s-category" name="categoryId" required defaultValue="" className={FIELD}>
          <option value="" disabled>
            {t("categoryPlaceholder")}
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="s-level" className="text-label text-fg-heading">
          {t("levelLabel")}
        </label>
        <select id="s-level" name="level" defaultValue="introductory" className={FIELD}>
          <option value="introductory">{tp("form.levelIntroductory")}</option>
          <option value="intermediate">{tp("form.levelIntermediate")}</option>
          <option value="advanced">{tp("form.levelAdvanced")}</option>
        </select>
      </div>

      <div>
        {/* REQ-SES-011: the language of the ROOM, not of the interface. */}
        <label htmlFor="s-language" className="text-label text-fg-heading">
          {t("languageLabel")}
        </label>
        <select id="s-language" name="language" defaultValue="ar" className={FIELD}>
          <option value="ar">{t("languageAr")}</option>
          <option value="en">{t("languageEn")}</option>
        </select>
      </div>

      <fieldset>
        <legend className="text-label text-fg-heading">{t("presentersLabel")}</legend>
        <p className="mt-1 text-body-sm text-fg-muted">{t("presentersHint")}</p>
        <ul className="mt-3 space-y-1">
          {members.map((m) => (
            <li key={m.id}>
              <label className="flex min-h-11 items-center gap-3 rounded-field px-2 text-body text-fg-body hover:bg-silver-100">
                <input type="checkbox" name="presenterIds" value={m.id} className="size-5" />
                <bdi>{m.displayName}</bdi>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <p className="text-body-sm text-fg-muted">{t("scheduleNote")}</p>
      <Button type="submit" disabled={pending}>
        {t("create")}
      </Button>
    </form>
  );
}
