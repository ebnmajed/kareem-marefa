import type { ReactNode } from "react";
import { CertificateModeControl, type CertificateModeValue, type ModePreflight } from "@/app/[locale]/app/admin/sessions/[id]/certificates/mode-control";
import type { SessionState } from "@/lib/dal/sessions";

// SCR-043's «الشهادة» row — DEC-256 (the owner, wave 27): the certificate mode sits with the session's other settings,
// where an admin sets the session up, and not only on its certificates tab after the choice it governs.
//
// ★ ONE WRITER STILL. This is SCR-045's own control, imported — `set_session_certificate_mode()` through
// `saveCertificateMode()`; it saves on its own, and the schedule form's save keeps sending `certificateMode: null`
// (`schedule/actions.ts`), so neither save moves the other. The control has no `<form>` and its buttons are
// `type="button"`, so inside the schedule form's edit mode it submits nothing.
//
// It is offered where SCR-045 offers it (`certificates/page.tsx:83`, `:213`): every state but `cancelled` — a completed
// one included, where saving issues at once (DEC-250) and the control is told so. A cancelled session, or one whose
// preflight could not be read, keeps the sentence the row has always shown.

export function ScheduleCertificateMode({
  locale,
  sessionId,
  state,
  mode,
  sentence,
  preflight,
}: {
  locale: string;
  sessionId: string;
  state: SessionState;
  mode: CertificateModeValue;
  /** The row's read sentence — what a cancelled session shows. */
  sentence: ReactNode;
  /** Null when SCR-045's reads could not be made; the row then reads, it does not offer. */
  preflight: ModePreflight | null;
}) {
  if (state === "cancelled" || preflight === null) return <>{sentence}</>;
  return <CertificateModeControl locale={locale} sessionId={sessionId} mode={mode} completed={state === "completed" || state === "archived"} preflight={preflight} />;
}
