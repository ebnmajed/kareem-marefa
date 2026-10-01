import type { ReactNode } from "react";
import { isDocumentLoad } from "@/components/scoring/document-load";
import { MomentCompletion } from "@/components/scoring/moment-completion";
import { acknowledgeWeekPoints } from "@/components/scoring/week-actions";
import type { SessionCompletion } from "@/lib/dal/points";

// The outcome card's moment 3, bound on the server (wave 18 PR B, REQ-UIX-061, DEC-209). scoring's file.
// `sessions` reads `getSessionCompletion()` for the card's words and wraps the card's figure area in this, with
// `<CompletionFigure text=… />` where the amount is drawn. The acknowledgement is bound here with the mark the
// page rendered, so the client sends nothing of its own — the same writer the home's week uses.

export async function CompletionMoment({ locale, completion, className, children }: { locale: string; completion: SessionCompletion; className?: string; children: ReactNode }) {
  const documentLoad = await isDocumentLoad();
  return (
    <MomentCompletion
      occurrenceId={completion.award.occurrenceId}
      points={completion.award.points}
      needsMark={completion.needsMark}
      acknowledge={acknowledgeWeekPoints.bind(null, locale, completion.mark)}
      documentLoad={documentLoad}
      className={className}
    >
      {children}
    </MomentCompletion>
  );
}
