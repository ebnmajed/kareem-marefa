import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireSession } from "@/lib/dal/session";
import { getHostView, listUncheckedConfirmedRsvps } from "@/lib/dal/checkin";
import { formatNumber } from "@/components/sessions/numerals";
import type { SessionPhase } from "@/lib/session-status";
import { markManuallyAction, revokeCodeAction, setWalkInsAction } from "./actions";

const KNOWN_MANUAL_ERRORS = new Set(["not_authorized", "reason_required", "not_found", "not_open", "member_not_found", "presenter_cannot_check_in", "unknown"]);

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
  searchParams: Promise<{ revoked?: string; walkIns?: string; manualSuccess?: string; manualError?: string; memberId?: string; reason?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requireSession(locale, `/${locale}/app/sessions/${id}/host`);
  const { revoked, walkIns, manualSuccess, manualError, memberId: submittedMemberId, reason: submittedReason } = await searchParams;
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
  const field = "mt-1 block h-12 w-full rounded-field border border-edge-strong bg-canvas px-4 text-body text-fg-heading";
  // `view.consoleActive` only knows the PHASE is eligible (open/live) — a
  // presenter reaches this far too (REQ-CHK-014's broader auth check), but
  // manual marking and the walk-in switch stay admin/moderator-only, as
  // before (REQ-CHK-008).
  const staffConsoleActive = view.consoleActive && isStaff;

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("host.title")}</h1>
      {revoked ? (
        <p role="status" className="mt-4 rounded-field border border-edge bg-silver-100 p-3 text-body text-fg-heading">
          {t("host.revoked")}
        </p>
      ) : null}

      {view.code ? (
        <p aria-live="polite" dir="ltr" className="mt-8 text-center font-bold leading-none text-fg-heading text-[length:var(--fs-display)] tracking-[0.35em]">
          {view.code}
        </p>
      ) : (
        /* REQ-CHK-004 at issuance (0078): no code exists outside the live window. */
        <p role="status" className="mt-8 rounded-field border border-edge bg-silver-100 p-4 text-center text-body text-fg-heading">
          {t(`host.${noCodeMessageKey(view.phase)}`)}
        </p>
      )}

      <p className="mt-6 text-center text-body text-fg-muted">{t("host.checkInCount", { count: view.checkInCount, value: formatNumber(view.checkInCount) })}</p>

      {view.code ? (
        <form action={revokeCodeAction.bind(null, locale, id)} className="mt-8 flex justify-center">
          <button type="submit" className="inline-flex h-12 items-center rounded-field border border-edge-strong px-7 text-label text-fg-heading hover:bg-silver-100">
            {t("host.revoke")}
          </button>
        </form>
      ) : null}

      {staffConsoleActive ? (
        /* DEC-065: the door policy, per session, for an admin or a moderator. */
        <section className="mt-12 max-w-sm">
          <h2 className="text-h3 text-fg-heading">{t("host.walkIns.title")}</h2>
          <p className="mt-2 text-body-sm text-fg-muted">{view.allowWalkIns ? t("host.walkIns.on") : t("host.walkIns.off")}</p>
          {walkIns === "1" || walkIns === "0" ? (
            <p role="status" className="mt-3 rounded-field border border-edge bg-silver-100 p-3 text-body text-fg-heading">
              {t("host.walkIns.saved")}
            </p>
          ) : null}
          <form action={setWalkInsAction.bind(null, locale, id, !view.allowWalkIns)} className="mt-3">
            <button type="submit" className="inline-flex h-12 items-center rounded-field border border-edge-strong px-7 text-label text-fg-heading hover:bg-silver-100">
              {view.allowWalkIns ? t("host.walkIns.close") : t("host.walkIns.open")}
            </button>
          </form>
        </section>
      ) : null}

      {staffConsoleActive ? (
        <section className="mt-12 max-w-sm">
          <h2 className="text-h3 text-fg-heading">{t("host.manualTitle")}</h2>

          {manualSuccess ? (
            <p role="status" className="mt-3 rounded-field border border-edge bg-silver-100 p-3 text-body text-fg-heading">
              {t("host.manualSuccess")}
            </p>
          ) : null}
          {manualErrorKey ? (
            <p role="alert" className="mt-3 rounded-field border border-edge-strong p-3 text-body text-fg-heading">
              {t(`host.manualError.${manualErrorKey}`)}
            </p>
          ) : null}

          {candidates.length === 0 ? (
            <p className="mt-3 text-body text-fg-muted">{t("host.manualNoCandidates")}</p>
          ) : (
            <form action={markManuallyAction.bind(null, locale, id)} className="mt-4 space-y-4">
              <div>
                <label htmlFor="memberId" className="text-label text-fg-heading">
                  {t("host.manualMember")}
                </label>
                <select id="memberId" name="memberId" required defaultValue={submittedMemberId ?? ""} className={field}>
                  {candidates.map((c) => (
                    <option key={c.memberId} value={c.memberId}>
                      {c.displayName ?? c.memberId}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="reason" className="text-label text-fg-heading">
                  {t("host.manualReason")}
                </label>
                <input id="reason" name="reason" required maxLength={300} defaultValue={submittedReason ?? ""} className={field} />
              </div>
              <button type="submit" className="inline-flex h-12 items-center rounded-field border border-edge-strong px-7 text-label text-fg-heading hover:bg-silver-100">
                {t("host.manualSubmit")}
              </button>
            </form>
          )}
        </section>
      ) : null}
    </>
  );
}
