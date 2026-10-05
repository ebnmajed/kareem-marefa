"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useRouter as useRawRouter } from "next/navigation";
import { ActionBar } from "@/components/ui/action-bar";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { AlertCircleIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Link } from "@/components/ui/link";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { TagChip } from "@/components/ui/tag-chip";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/components/sessions/numerals";
import { summaryErrors } from "@/lib/form-state";
import type { Locale } from "@/i18n/routing";
import type { MyInterests, SelfProfile } from "@/lib/dal/members";
import { saveProfile } from "@/app/[locale]/app/me/actions";
import { emptyProfileState, PROFILE_FIELDS, type ProfileField, type ProfileState } from "@/app/[locale]/app/me/state";
import { useHydrated } from "@/lib/hooks/use-hydrated";

// SCR-021 in edit mode — `MeEdit.dc.html`, `M10c.md` §1, REQ-UIX-071, `DEC-216` §5.12, `DEC-218` §4.2 – §4.3.
// Written from the artboard in wave 20 after `profile-form.tsx` was deleted (DEC-208); kept-behaviour table P1 – P22.
//
// ★ EDIT MODE NAMES ITS STATE: «تعديل ملفي», the count of unsaved changes beside it, each changed field marked —
// by an accent outline AND «(معدّل)» in its label, so the mark is never colour alone (SC 1.4.1). Nothing is written
// before «حفظ»; «إلغاء» is a link back to `/app/me`, which restores by leaving.
//
// ★ SAVE IS ENABLED IN THE SERVER'S HTML (DEC-218 §4.3, P11): a save pressed before hydration still persists
// (`wave10-content-me-early-save.spec.ts`). Once hydrated, it is enabled only when something changed.
//
// ★ EVERY FIELD IS CONTROLLED, so a refused save keeps what the member typed: React resets a `<form action>` after
// every submission, and the primitives put a controlled select and checkbox back (DEC-149 §1).
//
// ★ LEAVING WITH CHANGES ASKS: a press on any link while something is unsaved opens a dialog; a reload or a closed
// tab gets the browser's own question. The browser's Back is not asked about — with edit mode in the URL it returns
// to read mode (D13, recorded).
//
// ★ The leaderboard opt-out is not here (contract 5, `REQ-LDR-008`): it moved to `/app/me/settings`' switch in the
// same PR that added it, so no deployment of `main` lacked a way to opt out.
//
// ★ wave 27 (`DEC-254` §2.5, `REQ-PRF-012`, `STORY-PRF-007`): no company control. A member's company follows their
// email domain or an admin's placement; the read mode shows it, and the save never sends the column.

function FormError({ message }: { message: string }) {
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    region.current?.focus();
  }, []);
  return (
    <div ref={region} role="alert" tabIndex={-1} className="flex items-start gap-2 rounded-field border border-error-border bg-error-bg p-4 text-caption text-error">
      <AlertCircleIcon className="mt-[0.2em]" />
      <span>{message}</span>
    </div>
  );
}

const BIO_MAX = 600;

export interface ProfileEditProps {
  locale: Locale;
  me: SelfProfile;
  interests: MyInterests;
}

export function ProfileEdit({ locale, me, interests }: ProfileEditProps) {
  const t = useTranslations("profile");
  const tDialog = useTranslations("ui.dialog");
  const toast = useToast();
  const router = useRouter();
  const rawRouter = useRawRouter();
  const hydrated = useHydrated();
  const [state, formAction, pending] = useActionState<ProfileState, FormData>((prev, formData) => saveProfile(locale, prev, formData), emptyProfileState);

  const initial = {
    displayName: me.displayName ?? "",
    jobTitle: me.jobTitle ?? "",
    bio: me.bio ?? "",
    interests: interests.chosen.map((i) => i.id),
  };
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [jobTitle, setJobTitle] = useState(initial.jobTitle);
  const [bio, setBio] = useState(initial.bio);
  const [chosen, setChosen] = useState<string[]>(initial.interests);

  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));
  const changed = {
    displayName: displayName !== initial.displayName,
    jobTitle: jobTitle !== initial.jobTitle,
    bio: bio !== initial.bio,
    interests: !sameSet(chosen, initial.interests),
  };
  const unsaved = Object.values(changed).filter(Boolean).length;
  const dirty = unsaved > 0 && !state.saved;

  // Saved: once, then back to read mode. `state.saved` is a fresh object per success, so this runs once per save.
  useEffect(() => {
    if (!state.saved) return;
    toast.show({ title: t("saved"), tone: "success" });
    router.replace("/app/me");
  }, [state, router, t, toast]);

  // ★ Leaving with changes asks.
  const [leavingTo, setLeavingTo] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty || pending) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      setLeavingTo(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, pending]);

  const errorFor = (field: ProfileField) => {
    const key = state.errors[field];
    return key ? t(`errors.${key}`) : undefined;
  };
  const fieldLabel = (field: ProfileField): string => t(field);
  const summary = summaryErrors(state, { fields: PROFILE_FIELDS, label: fieldLabel, message: (key) => t(`errors.${key}`) });
  const label = (text: string, isChanged: boolean) => (
    <>
      {text}
      {isChanged ? <span className="sr-only"> {t("edit.changed")}</span> : null}
    </>
  );
  const mark = (isChanged: boolean) => (isChanged ? "rounded-field outline-2 outline-accent" : "");

  const names = new Map([...interests.options, ...interests.chosen].map((i) => [i.id, i.name]));
  const addable = interests.options.filter((o) => !chosen.includes(o.id));

  return (
    <section aria-labelledby="profile-edit-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="profile-edit-heading" className="font-display text-[1.25rem] leading-[1.4] font-extrabold text-fg-heading">
          {t("edit.title")}
        </h2>
        {unsaved > 0 ? (
          <span aria-live="polite" className="text-caption font-bold text-accent">
            {t("edit.unsaved", { count: unsaved, value: formatNumber(unsaved) })}
          </span>
        ) : (
          <span aria-live="polite" />
        )}
      </div>

      <form action={formAction} noValidate className="flex flex-col gap-5">
        {state.formError ? <FormError key={state.attempt} message={t(`errors.${state.formError}`)} /> : <FormSummary key={state.attempt} title={t("errors.summaryTitle")} errors={summary} />}

        <Field id="displayName" label={label(t("displayName"), changed.displayName)} required error={errorFor("displayName")}>
          <div className={mark(changed.displayName)}>
            <Input name="displayName" required maxLength={120} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
        </Field>

        <Field id="jobTitle" label={label(t("jobTitle"), changed.jobTitle)} error={errorFor("jobTitle")}>
          <div className={mark(changed.jobTitle)}>
            <Input name="jobTitle" maxLength={120} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
        </Field>

        <Field id="bio" label={label(t("bio"), changed.bio)} error={errorFor("bio")}>
          <div className={mark(changed.bio)}>
            <Textarea name="bio" rows={3} maxLength={BIO_MAX} value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>
        </Field>
        <p className="-mt-4 text-caption text-fg-muted">
          <bdi>{t("edit.bioCount", { count: formatNumber(bio.length), max: formatNumber(BIO_MAX) })}</bdi>
        </p>

        <Field id="interests" label={label(t("interests"), changed.interests)}>
          <div className={`flex flex-wrap items-center gap-1.5 ${mark(changed.interests)}`}>
            {chosen.map((id) => (
              <span key={id}>
                <TagChip label={names.get(id) ?? ""} onRemove={() => setChosen((prev) => prev.filter((x) => x !== id))} removeLabel={t("edit.removeInterest", { name: names.get(id) ?? "" })} />
                <input type="hidden" name="interests" value={id} />
              </span>
            ))}
            {addable.length > 0 ? (
              <Select
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) setChosen((prev) => [...prev, id]);
                }}
                className="w-auto min-w-40 flex-1"
              >
                <option value="">{t("edit.addInterest")}</option>
                {addable.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>
        </Field>

        <p className="flex flex-wrap gap-x-2 text-caption text-fg-muted">
          <span>{t("email")}</span>
          <bdi dir="ltr" className="font-bold text-fg-heading">
            {me.email}
          </bdi>
          <span>· {t("edit.emailSource")}</span>
        </p>

        <ActionBar
          label={t("edit.actions")}
          primary={
            <SubmitButton className="w-full" pendingLabel={t("saving")} disabled={hydrated && !dirty}>
              {t("save")}
            </SubmitButton>
          }
          secondary={[
            <Link key="cancel" href="/app/me" className={buttonClass("secondary", "lg")}>
              {t("edit.cancel")}
            </Link>,
          ]}
        />
      </form>

      <Dialog open={leavingTo !== null} onOpenChange={(open) => (open ? null : setLeavingTo(null))}>
        <DialogContent title={t("edit.leave.title")} closeLabel={tDialog("close")}>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="md"
              onClick={() => {
                const to = leavingTo;
                setLeavingTo(null);
                // An href read off the page already carries its locale, so the plain router, not next-intl's.
                if (to) rawRouter.push(to);
              }}
            >
              {t("edit.leave.confirm")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md">
                {t("edit.leave.stay")}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
