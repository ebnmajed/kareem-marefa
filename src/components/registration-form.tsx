"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  submitRegistration,
  type RegistrationState,
} from "@/app/[locale]/register/actions";
import {
  HONEYPOT_FIELD,
  TOPIC_CATEGORIES,
  validateRegistration,
  type RegistrationErrors,
  type RegistrationField,
} from "@/lib/schema";
import { Button } from "@/components/ui/button";

const initialState: RegistrationState = { status: "idle" };

const FIELDS = [
  "role",
  "name",
  "email",
  "topicTitle",
  "topicCategory",
  "topicDescription",
] as const;

const FIELD_IDS: Record<RegistrationField, string> = {
  role: "reg-role-provider",
  name: "reg-name",
  email: "reg-email",
  topicTitle: "reg-topic-title",
  topicCategory: "reg-category-technical",
  topicDescription: "reg-topic-description",
};

/** `token` is the server-rendered <FormToken/> hidden field. */
export function RegistrationForm({ token }: { token: ReactNode }) {
  const t = useTranslations("register");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(
    submitRegistration,
    initialState,
  );
  // Client-side corrections/additions only. Displayed errors merge the
  // server's (rendered even without JS — progressive enhancement) with
  // these; an explicit `undefined` here clears a fixed server error.
  const [clientErrors, setClientErrors] = useState<RegistrationErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const errors: RegistrationErrors = {
    ...(state.status === "error" ? state.errors : undefined),
    ...clientErrors,
  };

  // JS nicety on failed server submits; the error markup itself is
  // render-derived and needs no effect.
  useEffect(() => {
    if (state.status === "error" && state.errors) {
      focusFirstInvalid(state.errors);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function readValues() {
    const fd = new FormData(formRef.current ?? undefined);
    return {
      role: String(fd.get("role") ?? ""),
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      topicTitle: String(fd.get("topicTitle") ?? ""),
      topicDescription: String(fd.get("topicDescription") ?? ""),
      topicCategory: String(fd.get("topicCategory") ?? ""),
    };
  }

  /** Reward early, punish late: blur validates only fields with content (or
   * an existing error); input re-validates only fields currently in error. */
  function validateField(field: RegistrationField, onlyIfErrored = false) {
    const hasError = Boolean(errors[field]);
    if (onlyIfErrored && !hasError) return;
    const values = readValues();
    if (!onlyIfErrored && !hasError) {
      const raw = values[field as keyof typeof values];
      if (typeof raw === "string" && raw.trim() === "") return;
    }
    const result = validateRegistration(values);
    setClientErrors((prev) => ({ ...prev, [field]: result.errors[field] }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const result = validateRegistration(readValues());
    // Map EVERY field to its (possibly undefined) result so stale server
    // errors from the previous round are cleared, not just overridden.
    setClientErrors(
      Object.fromEntries(FIELDS.map((f) => [f, result.errors[f]])),
    );
    if (Object.keys(result.errors).length > 0) {
      e.preventDefault();
      setSubmitted(true);
      focusFirstInvalid(result.errors);
    }
  }

  function focusFirstInvalid(errs: RegistrationErrors) {
    const first = FIELDS.find((f) => errs[f]);
    if (!first) return;
    requestAnimationFrame(() => {
      document.getElementById(FIELD_IDS[first])?.focus();
    });
  }

  if (state.status === "success" || state.status === "duplicate") {
    return <SuccessPanel state={state} />;
  }

  const values = state.values;
  const visibleErrors = FIELDS.filter((f) => errors[f]);
  const showSummary =
    (submitted || state.status === "error") && visibleErrors.length > 0;

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-7"
    >
      {state.freshToken ? (
        <input type="hidden" name="form_token" value={state.freshToken} />
      ) : (
        token
      )}
      <input type="hidden" name="locale" value={locale} />
      <div className="hp-field" aria-hidden="true">
        <label>
          Leave this field empty
          <input
            type="text"
            name={HONEYPOT_FIELD}
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </label>
      </div>

      {showSummary && (
        <div
          role="alert"
          className="rounded-card border border-error-border bg-error-bg p-4"
        >
          <p className="text-label text-error">{t("errorSummaryTitle")}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {visibleErrors.map((f) => (
              <li key={f}>
                <a
                  href={`#${FIELD_IDS[f]}`}
                  className="text-caption text-error underline"
                >
                  {t(`errors.${errors[f]}`)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Role selection — cards are labels over real radios */}
      <fieldset
        className="role-choice scroll-mt-24"
        onChange={(e) => {
          const picked = (e.target as EventTarget & { value?: string }).value;
          setClientErrors((prev) => ({
            ...prev,
            role: undefined,
            // A hidden field must never hold the error summary hostage
            ...(picked === "attendee"
              ? { topicTitle: undefined, topicCategory: undefined }
              : {}),
          }));
        }}
      >
        <legend className="text-label text-fg-heading">
          {t("roleLegend")}
        </legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <RoleCard
            id="reg-role-provider"
            value="provider"
            title={t("providerCardTitle")}
            body={t("providerCardBody")}
            defaultChecked={values?.role === "provider"}
            invalid={Boolean(errors.role)}
          />
          <RoleCard
            id="reg-role-attendee"
            value="attendee"
            title={t("attendeeCardTitle")}
            body={t("attendeeCardBody")}
            defaultChecked={values?.role === "attendee"}
            invalid={Boolean(errors.role)}
          />
        </div>
        <p className="mt-2 text-caption text-fg-muted">{t("roleHelper")}</p>
        {errors.role && <FieldError id="reg-role-error" msg={t(`errors.${errors.role}`)} />}
      </fieldset>

      <div className="flex flex-col gap-7">
        <TextField
          id="reg-name"
          name="name"
          label={t("nameLabel")}
          autoComplete="name"
          defaultValue={values?.name}
          error={errors.name && t(`errors.${errors.name}`)}
          maxLength={100}
          onBlur={() => validateField("name")}
          onInput={() => validateField("name", true)}
          ariaRequired
        />
        <TextField
          id="reg-email"
          name="email"
          type="email"
          label={t("emailLabel")}
          hint={t("emailHint")}
          privacy={t("emailPrivacy")}
          autoComplete="email"
          inputMode="email"
          dir="ltr"
          defaultValue={values?.email}
          error={errors.email && t(`errors.${errors.email}`)}
          maxLength={254}
          onBlur={() => validateField("email")}
          onInput={() => validateField("email", true)}
          ariaRequired
        />
      </div>

      {/* Provider topic fields — CSS-revealed via the `~` sibling selector
          on .role-choice, so the reveal works before hydration and without
          JS. Kept-but-hidden on role switch: display:none inputs still
          submit; the server strips them for attendees. */}
      <div className="provider-fields flex-col gap-7">
        <TextField
          id="reg-topic-title"
          name="topicTitle"
          label={t("topicTitleLabel")}
          hint={t("topicTitleHint")}
          defaultValue={values?.topicTitle}
          error={errors.topicTitle && t(`errors.${errors.topicTitle}`)}
          maxLength={150}
          onBlur={() => validateField("topicTitle")}
          onInput={() => validateField("topicTitle", true)}
          ariaRequired
        />

        <fieldset
          className="scroll-mt-24"
          onChange={() =>
            setClientErrors((prev) => ({ ...prev, topicCategory: undefined }))
          }
        >
          <legend className="text-label text-fg-heading">
            {t("categoryLabel")}
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {TOPIC_CATEGORIES.map((cat) => (
              <label
                key={cat}
                className="flex h-10 cursor-pointer items-center rounded-full border border-[var(--edge-strong)] px-4.5 text-label text-fg-body transition-colors duration-150 hover:border-navy-950 has-checked:border-navy-950 has-checked:bg-navy-950 has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--ring)]"
              >
                <input
                  type="radio"
                  name="topicCategory"
                  value={cat}
                  id={`reg-category-${cat}`}
                  className="sr-only"
                  defaultChecked={values?.topicCategory === cat}
                />
                {t(
                  `category${(cat[0].toUpperCase() + cat.slice(1)) as Capitalize<typeof cat>}`,
                )}
              </label>
            ))}
          </div>
          {errors.topicCategory && (
            <FieldError
              id="reg-category-error"
              msg={t(`errors.${errors.topicCategory}`)}
            />
          )}
        </fieldset>

        <TextField
          id="reg-topic-description"
          name="topicDescription"
          label={`${t("descriptionLabel")} ${t("descriptionOptional")}`}
          hint={t("descriptionHint")}
          defaultValue={values?.topicDescription}
          error={
            errors.topicDescription && t(`errors.${errors.topicDescription}`)
          }
          maxLength={600}
          onBlur={() => validateField("topicDescription")}
          onInput={() => validateField("topicDescription", true)}
          textarea
        />
      </div>

      <div className="flex flex-col gap-3">
        {state.errors?.form && (
          <p
            role="alert"
            className="rounded-field border border-error-border bg-error-bg p-3 text-caption text-error"
          >
            {t(`errors.${state.errors.form}`)}
          </p>
        )}
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="min-w-48 self-start"
        >
          {pending ? (
            <span className="flex items-center gap-2">
              <Spinner />
              {t("submitting")}
            </span>
          ) : (
            t("submit")
          )}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------- pieces --------------------------------- */

function RoleCard({
  id,
  value,
  title,
  body,
  defaultChecked,
  invalid,
}: {
  id: string;
  value: "provider" | "attendee";
  title: string;
  body: string;
  defaultChecked?: boolean;
  invalid?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className="relative block cursor-pointer rounded-card border border-silver-300 bg-white p-6 shadow-card transition-colors duration-150 hover:border-silver-400 has-checked:border-navy-950 has-checked:shadow-[inset_0_0_0_1px_#0B1220] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--ring)]"
    >
      <input
        type="radio"
        name="role"
        value={value}
        id={id}
        className="peer sr-only"
        defaultChecked={defaultChecked}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? "reg-role-error" : undefined}
      />
      <span
        aria-hidden="true"
        className="absolute end-5 top-5 size-2 rounded-full bg-silver-200 transition-colors duration-150 peer-checked:bg-navy-950"
      />
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="text-silver-400 peer-checked:text-navy-950"
      >
        <line x1="5" y1="14" x2="14" y2="6" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="4.5" cy="14.5" r="2.5" fill="currentColor" />
        <circle cx="15" cy="5" r="3" fill="currentColor" />
      </svg>
      <span className="mt-3 block text-[1.0625rem] font-semibold leading-7 text-fg-heading">
        {title}
      </span>
      <span className="mt-1 block text-caption text-fg-muted">{body}</span>
    </label>
  );
}

function TextField({
  id,
  name,
  label,
  hint,
  privacy,
  error,
  textarea,
  ariaRequired,
  ...inputProps
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  privacy?: string;
  error?: string | false;
  textarea?: boolean;
  ariaRequired?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "id"> &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name" | "id">) {
  const hintId = hint ? `${id}-hint` : undefined;
  const privacyId = privacy ? `${id}-privacy` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy =
    [hintId, privacyId, errorId].filter(Boolean).join(" ") || undefined;

  const fieldClasses = `w-full rounded-field border bg-white px-4 text-body text-fg-heading transition-colors duration-150 placeholder:text-[#8A93A6] focus:outline-none focus:ring-0 ${
    error
      ? "border-error-border focus:border-error focus:shadow-[0_0_0_3px_rgba(158,59,63,0.12)]"
      : "border-[var(--edge-strong)] hover:border-slate-muted focus:border-navy-950 focus:shadow-[0_0_0_3px_rgba(11,18,32,0.10)]"
  }`;

  return (
    <div className="scroll-mt-24">
      <label htmlFor={id} className="block text-label text-fg-heading">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="mt-1 text-caption text-fg-muted">
          {hint}
        </p>
      )}
      {textarea ? (
        <textarea
          id={id}
          name={name}
          rows={3}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          aria-required={ariaRequired || undefined}
          className={`${fieldClasses} mt-2 min-h-[7.5rem] py-3`}
          {...(inputProps as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          id={id}
          name={name}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          aria-required={ariaRequired || undefined}
          className={`${fieldClasses} mt-2 h-13`}
          {...(inputProps as React.InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
      {privacy && (
        <p id={privacyId} className="mt-2 text-caption text-fg-muted">
          {privacy}
        </p>
      )}
      {error && <FieldError id={errorId!} msg={error} />}
    </div>
  );
}

function FieldError({ id, msg }: { id: string; msg: string }) {
  return (
    <p
      id={id}
      aria-live="polite"
      className="mt-2 flex items-start gap-1.5 text-caption text-error"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        aria-hidden="true"
        className="mt-1 shrink-0"
      >
        <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <line x1="7" y1="4" x2="7" y2="7.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="7" cy="10" r="0.9" fill="currentColor" />
      </svg>
      {msg}
    </p>
  );
}

function Spinner() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="animate-spin"
    >
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="38"
        strokeDashoffset="12"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SuccessPanel({ state }: { state: RegistrationState }) {
  const t = useTranslations("register");
  const role = state.role ?? "attendee";
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    headingRef.current?.focus();
    setShareUrl(`${window.location.origin}${window.location.pathname}`);
  }, []);

  const duplicate = state.status === "duplicate";
  const title = duplicate
    ? t("errors.duplicate")
    : t(`success.${role}Title`);
  const body = t(`success.${role}Body`);

  return (
    <div
      role="status"
      className="rounded-card border border-success/30 bg-success-bg p-8"
    >
      {/* "Your dot joined the network" — one dot, one ripple */}
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" className="text-success">
        <circle cx="20" cy="20" r="4" fill="currentColor" />
        <circle
          className="ripple-ring"
          cx="20"
          cy="20"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <line x1="26" y1="14" x2="33" y2="9" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        <circle cx="34" cy="8" r="2" fill="currentColor" opacity="0.6" />
      </svg>
      <h2 ref={headingRef} tabIndex={-1} className="mt-4 text-h3">
        {title}
      </h2>
      <p className="mt-3 max-w-prose text-body text-fg-body">{body}</p>
      <p className="mt-6 text-caption font-medium text-fg-muted">
        {t("success.tagline")}
      </p>
      {shareUrl && (
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${t("success.inviteText")} ${shareUrl}`)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-flex h-11 items-center rounded-field border border-[var(--btn2-border)] px-5 text-label text-fg-heading transition-colors duration-150 hover:bg-white"
        >
          {t("success.invite")}
        </a>
      )}
    </div>
  );
}
