import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireSession } from "@/lib/dal/session";
import { getHostView, listUncheckedConfirmedRsvps } from "@/lib/dal/checkin";
import { getOrgNumerals } from "@/lib/dal/designer";
import { formatNumber } from "@/components/sessions/numerals";
import { markManuallyAction, revokeCodeAction, setWalkInsAction } from "./actions";

const KNOWN_MANUAL_ERRORS = new Set(["not_authorized", "reason_required", "not_found", "not_open", "member_not_found", "presenter_cannot_check_in", "unknown"]);

// SCR-016 — the host view (REQ-CHK-001, REQ-CHK-014, OQ-013). Presenters,
// admins and moderators only — getHostView() returns null for anyone else,
// by policy (ensure_check_in_code's authorization check), not merely by
// hiding this page's UI.
//
// Manual marking (REQ-CHK-008) is narrower: admins and moderators only, not
// presenters — mark_checked_in_manually() enforces this itself, and the
// session's own org_role (not the host view's presenter-or-staff gate)
// decides whether this page even fetches the candidate list.
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

  const [view, candidates, t, numerals] = await Promise.all([
    getHostView(locale, id),
    isStaff ? listUncheckedConfirmedRsvps(locale, id) : Promise.resolve([]),
    getTranslations("checkin"),
    // REQ-INT-006: the count prints with the org's numerals, never ICU's `#` (DEC-056).
    getOrgNumerals(locale),
  ]);

  if (!view) {
    return <h1 className="text-h1 text-fg-heading">{t("host.notAuthorized")}</h1>;
  }

  const manualErrorKey = manualError && KNOWN_MANUAL_ERRORS.has(manualError) ? manualError : manualError ? "unknown" : null;
  const field = "mt-1 block h-12 w-full rounded-field border border-edge-strong bg-canvas px-4 text-body text-fg-heading";

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
          {view.phase === "ended" ? t("host.ended") : t("host.notStarted")}
        </p>
      )}

      <p className="mt-6 text-center text-body text-fg-muted">{t("host.checkInCount", { count: view.checkInCount, value: formatNumber(view.checkInCount, numerals) })}</p>

      {view.code ? (
        <form action={revokeCodeAction.bind(null, locale, id)} className="mt-8 flex justify-center">
          <button type="submit" className="inline-flex h-12 items-center rounded-field border border-edge-strong px-7 text-label text-fg-heading hover:bg-silver-100">
            {t("host.revoke")}
          </button>
        </form>
      ) : null}

      {isStaff ? (
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

      {isStaff ? (
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
