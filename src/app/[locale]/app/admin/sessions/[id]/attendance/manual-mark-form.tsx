"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { UncheckedAttendee } from "@/lib/dal/checkin";
import type { ManualMarkState } from "./actions";
import { emptyManualMarkState } from "./state";

/** One day as this form offers it — the label is the page's, already formatted. */
export interface MarkableDay {
  id: string;
  label: string;
}

export function ManualMarkForm({
  action,
  unchecked,
  days,
  defaultDayId,
  candidatesByDay,
}: {
  action: (prev: ManualMarkState, formData: FormData) => Promise<ManualMarkState>;
  /** Everyone still missing at least one day — the union, for the empty check. */
  unchecked: UncheckedAttendee[];
  /** Every day of the session. Length 1 for nearly every session. */
  days: MarkableDay[];
  /** The day the room is on now (`resolve_session_day()`'s own answer). */
  defaultDayId: string | null;
  /** Who is missing WHICH day — so switching the day switches the list. */
  candidatesByDay: Record<string, UncheckedAttendee[]>;
}) {
  const t = useTranslations("checkin.attendance");
  const [state, formAction, pending] = useActionState(action, emptyManualMarkState);
  const formRef = useRef<HTMLFormElement>(null);
  // ★ The only client state on this form, and it exists for one reason: an
  // admin correcting Tuesday's list on Thursday must see TUESDAY's missing
  // members, not Thursday's. At one day there is no select and this never
  // moves off its initial value.
  // ★ The default is VALIDATED against the list, not trusted. A `defaultDayId`
  // that is not one of these days — a page rendered before a day was deleted,
  // a hand-edited field — would otherwise travel to the RPC, which refuses it
  // `not_found`: an error the admin can neither see the cause of nor act on.
  const [dayId, setDayId] = useState(days.some((d) => d.id === defaultDayId) ? (defaultDayId as string) : (days[0]?.id ?? ""));
  const manyDays = days.length > 1;

  // A successful mark clears the form so it is ready for the next attendee
  // — the row it just marked drops out of `unchecked` on revalidation, but
  // the reason field would otherwise still hold the previous person's text.
  useEffect(() => {
    if (state.done) formRef.current?.reset();
  }, [state.done]);

  if (unchecked.length === 0) return <p className="mt-3 text-body-sm text-fg-muted">{t("empty")}</p>;

  const candidates = candidatesByDay[dayId] ?? unchecked;

  return (
    // `noValidate`: this form renders the app's own `error.*` banner below,
    // so the browser's native validation must stay out of the way —
    // content's own real-build finding (7f4809f): without it, the select's
    // `required` blocks the submit silently and the RPC's own refusal, or
    // this form's Arabic error, never has a chance to render.
    <form ref={formRef} action={formAction} noValidate className="mt-4 max-w-md space-y-4">
      {manyDays ? (
        <Field id="manual-day" label={t("dayLabel")} hint={t("markDayHint")}>
          <Select name="dayId" value={dayId} onChange={(e) => setDayId(e.target.value)}>
            {days.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        /* At one day the day is not a question. It still travels, so the RPC
           is never left to resolve it from a clock that may have crossed a
           boundary since this page rendered. */
        <input type="hidden" name="dayId" value={dayId} />
      )}
      {/* `key`: `ui/select` already keeps an uncontrolled choice through React's
          post-submission form reset, but the DAY is in this key for a second
          reason it cannot know about — switching days replaces the option list
          entirely, and a selection from the previous day must not survive it. */}
      <Field id="manual-member" label={t("memberLabel")}>
        <Select key={`member-${dayId}-${state.memberId ?? ""}-${state.error ?? ""}`} name="memberId" required defaultValue={state.memberId ?? ""}>
          <option value="" disabled>
            {t("memberPlaceholder")}
          </option>
          {candidates.map((m) => (
            <option key={m.memberId} value={m.memberId}>
              {m.displayName ?? m.memberId}
            </option>
          ))}
        </Select>
      </Field>
      {/* ★ `Field` is NOT marked `required` on any of the three, and that is
          deliberate rather than an oversight: the marker «مطلوب» becomes part of
          the control's accessible name, and this form's labels are asserted
          verbatim by its e2e and component tests. The markup moves onto the
          system; the copy does not move at all. `aria-required` below still
          wins over the context, because the control spreads its own props last. */}
      <Field id="manual-reason" label={t("reasonLabel")}>
        <Textarea name="reason" aria-required="true" defaultValue={state.reason ?? ""} rows={2} maxLength={300} />
      </Field>
      <Button type="submit" disabled={pending}>
        {t("mark")}
      </Button>
      {state.error ? (
        <p role="alert" className="text-body-sm text-fg-heading">
          {t(`error.${state.error}`)}
        </p>
      ) : null}
    </form>
  );
}
