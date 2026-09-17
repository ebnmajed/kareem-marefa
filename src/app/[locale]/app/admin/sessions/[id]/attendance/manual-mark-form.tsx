"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
        <div>
          <label htmlFor="manual-day" className="text-label text-fg-heading">
            {t("dayLabel")}
          </label>
          <select
            id="manual-day"
            name="dayId"
            value={dayId}
            onChange={(e) => setDayId(e.target.value)}
            className="mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body text-fg-heading"
          >
            {days.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-body-sm text-fg-muted">{t("markDayHint")}</p>
        </div>
      ) : (
        /* At one day the day is not a question. It still travels, so the RPC
           is never left to resolve it from a clock that may have crossed a
           boundary since this page rendered. */
        <input type="hidden" name="dayId" value={dayId} />
      )}
      <div>
        <label htmlFor="manual-member" className="text-label text-fg-heading">
          {t("memberLabel")}
        </label>
        {/* `key`: React's form reset restores a <select> to its options' original
            `selected` state, so a new defaultValue alone does not re-select the
            member the admin chose; remounting with the echoed value does. The
            day is in the key too — switching days replaces the option list, and
            a stale selection must not survive it. */}
        <select
          key={`member-${dayId}-${state.memberId ?? ""}-${state.error ?? ""}`}
          id="manual-member"
          name="memberId"
          required
          defaultValue={state.memberId ?? ""}
          className="mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body text-fg-heading"
        >
          <option value="" disabled>
            {t("memberPlaceholder")}
          </option>
          {candidates.map((m) => (
            <option key={m.memberId} value={m.memberId}>
              {m.displayName ?? m.memberId}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="manual-reason" className="text-label text-fg-heading">
          {t("reasonLabel")}
        </label>
        <textarea
          id="manual-reason"
          name="reason"
          aria-required="true"
          defaultValue={state.reason ?? ""}
          rows={2}
          maxLength={300}
          className="mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body text-fg-heading"
        />
      </div>
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
