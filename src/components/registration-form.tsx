"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  submitRegistration,
  type RegistrationState,
} from "@/app/[locale]/(marketing)/register/actions";
import {
  HONEYPOT_FIELD,
  TOPIC_CATEGORIES,
  validateRegistration,
  type RegistrationErrors,
  type RegistrationField,
} from "@/lib/schema";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { CheckIcon, ShareIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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

/** Module scope, not component scope: it closes over nothing but the constants
 * above, and the failed-submit effect below runs before its old in-component
 * declaration was reached. */
function focusFirstInvalid(errs: RegistrationErrors) {
  const first = FIELDS.find((f) => errs[f]);
  if (!first) return;
  requestAnimationFrame(() => {
    document.getElementById(FIELD_IDS[first])?.focus();
  });
}

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
      className="flex flex-col gap-6"
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
          {/* ui-lint-disable-next-line field — the honeypot: off-screen, aria-hidden, never filled by a person; a labelled <Field> would announce it */}
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
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
          autoCapitalize="words"
          enterKeyHint="next"
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
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
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
          autoCapitalize="sentences"
          enterKeyHint="next"
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
                className="flex min-h-11 cursor-pointer items-center rounded-pill border border-edge bg-surface px-4.5 text-body-sm font-bold text-fg-heading hover:bg-raised has-checked:border-accent has-checked:bg-accent has-checked:text-on-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--ring)]"
              >
                {/* ui-lint-disable-next-line field — self-labelling, as ui/radio-group is: the chip IS the label; its id is the registration contract (qa:contract) */}
                <input
                  type="radio"
                  name="topicCategory"
                  value={cat}
                  id={`reg-category-${cat}`}
                  className="sr-only"
                  defaultChecked={values?.topicCategory === cat}
                  aria-invalid={Boolean(errors.topicCategory) || undefined}
                  aria-describedby={
                    errors.topicCategory ? "reg-category-error" : undefined
                  }
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
          label={t("descriptionLabel")}
          hint={t("descriptionHint")}
          autoCapitalize="sentences"
          enterKeyHint="done"
          defaultValue={values?.topicDescription}
          error={
            errors.topicDescription && t(`errors.${errors.topicDescription}`)
          }
          maxLength={600}
          onBlur={() => validateField("topicDescription")}
          onInput={() => validateField("topicDescription", true)}
          textarea
          ariaRequired
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
          className="w-full"
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
      className="relative block cursor-pointer rounded-card border border-edge bg-surface p-4 pe-10 hover:bg-raised has-checked:border-accent has-checked:bg-raised has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--ring)]"
    >
      {/* ui-lint-disable-next-line field — self-labelling, as ui/radio-group is: the card IS the label; its id is the registration contract (qa:contract) */}
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
      {/* The mark of the choice: a ring that fills. The card's border says it too, so colour is not alone. */}
      <span
        aria-hidden="true"
        className="absolute end-4 top-4 size-4 rounded-pill border-2 border-edge-strong peer-checked:border-accent peer-checked:bg-accent"
      />
      <span className="block font-display text-[1.125rem] leading-[1.4] font-extrabold text-fg-heading">
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
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "id" | "size"> &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name" | "id">) {
  // On the system since M13 (REQ-UIX-001): `<Field>` owns the label, the hint, the error and the
  // aria, and names the error `${id}-error` — the id qa:contract reads. The privacy line is this
  // form's own and joins the description by id, merged, never replacing the Field's.
  const privacyId = privacy ? `${id}-privacy` : undefined;

  return (
    <div className="scroll-mt-24">
      <Field id={id} label={label} hint={hint} error={error || undefined} required={ariaRequired}>
        {textarea ? (
          <Textarea
            name={name}
            rows={3}
            aria-describedby={privacyId}
            className="min-h-[7.5rem]"
            {...(inputProps as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <Input
            name={name}
            size="lg"
            aria-describedby={privacyId}
            {...(inputProps as Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">)}
          />
        )}
      </Field>
      {privacy && (
        <p id={privacyId} className="mt-2 text-caption text-fg-muted">
          {privacy}
        </p>
      )}
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

/* The share URL is client-only: the panel is also server-rendered (the no-JS
   path POSTs straight to it), so there is no `window` at that point. Reading it
   through useSyncExternalStore gives the "" server snapshot and the real client
   one without a hydration mismatch — and without a setState inside an effect,
   which cascades a second render on every success. The store never changes, so
   `subscribe` is a no-op; the snapshot is a plain string, so React's identity
   check is satisfied by value. */
const noSubscribe = () => () => {};
const clientShareUrl = () =>
  `${window.location.origin}${window.location.pathname}`;
const serverShareUrl = () => "";

function SuccessPanel({ state }: { state: RegistrationState }) {
  const t = useTranslations("register");
  const role = state.role ?? "attendee";
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shareUrl = useSyncExternalStore(
    noSubscribe,
    clientShareUrl,
    serverShareUrl,
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  /* Open the OS share sheet so the user picks where to send it (WhatsApp,
     Messages, email, …). Where that API is missing — mostly desktop — fall
     back to copying the invite to the clipboard with a brief confirmation. */
  const handleShare = async () => {
    // Keep the link on its own line AFTER the sentence and pass it inside
    // `text` (not as a separate `url`) — iOS/WhatsApp prepend a separate url,
    // which shoves the link above the RTL copy and breaks the reading order.
    // WhatsApp still detects the URL in the body and renders its link preview.
    const message = `${t("success.inviteText")}\n${shareUrl}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: t("success.shareTitle"),
          text: message,
        });
      } catch {
        // User dismissed the sheet, or the share was cancelled — no-op.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context) — nothing more to do.
    }
  };

  const duplicate = state.status === "duplicate";
  const title = duplicate
    ? t("errors.duplicate")
    : t(`success.${role}Title`);
  const body = t(`success.${role}Body`);

  return (
    <div
      role="status"
      className="rounded-panel border border-edge bg-surface p-6"
    >
      <span aria-hidden="true" className="inline-flex size-12 items-center justify-center rounded-pill bg-accent text-on-accent">
        <CheckIcon />
      </span>
      <h2 ref={headingRef} tabIndex={-1} className="mt-4 font-display text-[1.5rem] leading-[1.4] font-extrabold text-fg-heading">
        {title}
      </h2>
      <p className="mt-2 max-w-prose text-body text-fg-muted">{body}</p>
      <p className="mt-6 text-caption font-medium text-fg-muted">
        {t("success.tagline")}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {shareUrl && (
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={handleShare}
            aria-live="polite"
            iconStart={<ShareIcon />}
          >
            {copied ? t("success.copied") : t("success.invite")}
          </Button>
        )}
        {/* The platform is open (REQ-UIX-025): the interest list is not a sign-up, so the
            panel says where the platform is rather than pretending registering was entering. */}
        <ButtonLink href="/sign-in" locale="ar" hrefLang="ar" variant="ghost" size="md">
          {t("success.signIn")}
        </ButtonLink>
      </div>
    </div>
  );
}
