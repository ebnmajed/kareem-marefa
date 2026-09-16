import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireSession } from "@/lib/dal/session";
import { getHostView, listUncheckedConfirmedRsvps } from "@/lib/dal/checkin";
import { formatNumber } from "@/components/sessions/numerals";
import type { SessionPhase } from "@/lib/session-status";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Panel } from "@/components/ui/panel";
import { markManuallyAction, revokeCodeAction, setCheckInOpenAction } from "./actions";

const KNOWN_MANUAL_ERRORS = new Set(["not_authorized", "reason_required", "not_found", "not_open", "member_not_found", "presenter_cannot_check_in", "unknown"]);
const KNOWN_SWITCH_ERRORS = new Set(["not_found", "not_authorized", "not_open", "ceiling_passed", "unknown"]);

/** The paragraph under the missing code — bug (d), 16 §5.4.1 row 6: this used to have no phase condition at all, so a presenter saw a live-attendance console for a talk that ended in March. Now every one of the six phases says something true. */
function noCodeMessageKey(phase: SessionPhase): "notPublished" | "cancelled" | "notStarted" | "ended" {
  switch (phase) {
    case "draft":
    case "pending_schedule":
      return "notPublished";
    case "cancelled":
      return "cancelled";
    case "ended":
      return "ended";
    default:
      // "open" is the pre-flight case, and a clock-derived "live" with the
      // row still `published` (the RPC's own not_open — start_session
      // hasn't run yet) reads the same way: accurate, not confusing.
      return "notStarted";
  }
}

// SCR-016 — the host view (REQ-CHK-001, REQ-CHK-014, OQ-013, REQ-UIX-015,
// DEC-090). Presenters, admins and moderators only — getHostView() returns
// null for anyone else, by policy (ensure_check_in_code's authorization
// check), not merely by hiding this page's UI.
//
// ★ Bug (d) fix (16 §5.4.1 row 6): the walk-in toggle and manual-marking
// sections used to render for any staff viewer regardless of phase — a
// presenter of a draft or a cancelled session got the same operational
// console as one running live. Both now gate on `view.consoleActive`
// (`affordancesFor(phase, "staff").hostConsole` — true only for `open`, the
// pre-flight, and `live`). Manual marking is narrower still (REQ-CHK-008):
// admins and moderators only, not presenters — mark_checked_in_manually()
// enforces this itself, and the session's own org_role decides whether this
// page even fetches the candidate list.
export default async function HostPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ revoked?: string; manualSuccess?: string; manualError?: string; memberId?: string; reason?: string; switch?: string; switchError?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requireSession(locale, `/${locale}/app/sessions/${id}/host`);
  const { revoked, manualSuccess, manualError, memberId: submittedMemberId, reason: submittedReason, switch: switchResult, switchError } = await searchParams;
  const isStaff = session.role === "admin" || session.role === "moderator";

  const [view, candidates, t] = await Promise.all([
    getHostView(locale, id),
    isStaff ? listUncheckedConfirmedRsvps(locale, id) : Promise.resolve([]),
    getTranslations("checkin"),
  ]);

  if (!view) {
    return <h1 className="text-h1 text-fg-heading">{t("host.notAuthorized")}</h1>;
  }

  const manualErrorKey = manualError && KNOWN_MANUAL_ERRORS.has(manualError) ? manualError : manualError ? "unknown" : null;
  const switchErrorKey = switchError && KNOWN_SWITCH_ERRORS.has(switchError) ? switchError : switchError ? "unknown" : null;
  // `view.consoleActive` only knows the PHASE is eligible (open/live) — a
  // presenter reaches this far too (REQ-CHK-014's broader auth check), but
  // manual marking stays admin/moderator-only, as before (REQ-CHK-008).
  const staffConsoleActive = view.consoleActive && isStaff;

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("host.title")}</h1>
      {revoked ? (
        <div role="status" className="mt-4">
          <Panel tone="info">{t("host.revoked")}</Panel>
        </div>
      ) : null}

      {view.code ? (
        <p aria-live="polite" dir="ltr" className="mt-8 text-center font-bold leading-none text-fg-heading text-[length:var(--fs-display)] tracking-[0.35em]">
          {view.code}
        </p>
      ) : (
        /* REQ-CHK-004 at issuance (0078): no code exists outside the live window. */
        <div role="status" className="mt-8">
          <Panel tone="info" className="text-center">
            {t(`host.${noCodeMessageKey(view.phase)}`)}
          </Panel>
        </div>
      )}

      <p className="mt-6 text-center text-body text-fg-muted">{t("host.checkInCount", { count: view.checkInCount, value: formatNumber(view.checkInCount) })}</p>

      {/* DEC-117: no toggle here anymore — walk-ins are decided at
          publishing, on the schedule form (`sessions`'). The room still
          benefits from knowing the policy while running it. */}
      <p className="mt-2 text-center text-body-sm text-fg-muted">{view.allowWalkIns ? t("host.walkIns.on") : t("host.walkIns.off")}</p>

      {/* DEC-141/REQ-CHK-015 — the manual switch. Gated on `view.consoleActive`
          alone, not `staffConsoleActive`: `set_check_in_open()` authorizes the
          session's own presenter OR staff, the same broader set the console
          itself is already scoped to (REQ-CHK-014), unlike manual marking
          (admin/moderator only). Closing admits nobody new and revokes
          nothing already recorded (DEC-115) — `closedHint` says so, so a
          presenter closing the door mid-session isn't guessing what it does. */}
      {view.consoleActive ? (
        <section className="mt-6 flex flex-col items-center gap-2 border-y border-edge py-6">
          {switchResult === "opened" ? (
            <div role="status">
              <Panel tone="info">{t("host.checkInSwitch.opened")}</Panel>
            </div>
          ) : null}
          {switchResult === "closed" ? (
            <div role="status">
              <Panel tone="info">{t("host.checkInSwitch.closed")}</Panel>
            </div>
          ) : null}
          {switchErrorKey ? (
            <div role="alert">
              <Panel tone="error">{t(`host.checkInSwitch.error.${switchErrorKey}`)}</Panel>
            </div>
          ) : null}

          <p className="text-body text-fg-heading">{view.checkInOpen ? t("host.checkInSwitch.statusOpen") : t("host.checkInSwitch.statusClosed")}</p>
          {!view.checkInOpen ? <p className="max-w-sm text-center text-body-sm text-fg-muted">{t("host.checkInSwitch.closedHint")}</p> : null}

          <form action={setCheckInOpenAction.bind(null, locale, id, !view.checkInOpen)} className="mt-1">
            <Button type="submit" variant={view.checkInOpen ? "secondary" : "primary"}>
              {view.checkInOpen ? t("host.checkInSwitch.close") : t("host.checkInSwitch.open")}
            </Button>
          </form>
        </section>
      ) : null}

      {view.code ? (
        <form action={revokeCodeAction.bind(null, locale, id)} className="mt-8 flex justify-center">
          <Button type="submit" variant="secondary">
            {t("host.revoke")}
          </Button>
        </form>
      ) : null}

      {staffConsoleActive ? (
        <section className="mt-12 max-w-sm">
          <h2 className="text-h3 text-fg-heading">{t("host.manualTitle")}</h2>

          {manualSuccess ? (
            <div role="status" className="mt-3">
              <Panel tone="info">{t("host.manualSuccess")}</Panel>
            </div>
          ) : null}
          {manualErrorKey ? (
            <div role="alert" className="mt-3">
              <Panel tone="error">{t(`host.manualError.${manualErrorKey}`)}</Panel>
            </div>
          ) : null}

          {/* `noValidate` below: renders `manualErrorKey`'s own Panel above
              (the app's Arabic error) — content's bug class (7f4809f):
              without it, the Select/Input's own `required` blocks the
              submit silently and neither the RPC's refusal nor this banner
              is ever reached. */}
          {candidates.length === 0 ? (
            <p className="mt-3 text-body text-fg-muted">{t("host.manualNoCandidates")}</p>
          ) : (
            <form action={markManuallyAction.bind(null, locale, id)} noValidate className="mt-4 space-y-4">
              <Field id="memberId" label={t("host.manualMember")}>
                <Select name="memberId" required defaultValue={submittedMemberId ?? ""}>
                  {candidates.map((c) => (
                    <option key={c.memberId} value={c.memberId}>
                      {c.displayName ?? c.memberId}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="reason" label={t("host.manualReason")}>
                <Input name="reason" required maxLength={300} defaultValue={submittedReason ?? ""} />
              </Field>
              <Button type="submit" variant="secondary">
                {t("host.manualSubmit")}
              </Button>
            </form>
          )}
        </section>
      ) : null}
    </>
  );
}
