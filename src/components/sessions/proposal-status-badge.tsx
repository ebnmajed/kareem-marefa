import { useTranslations } from "next-intl";
import type { Tone } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import type { ProposalState } from "@/lib/dal/proposals";

// A proposal's state on the shared status vocabulary — SCR-017's «مقترحاتي»
// and SCR-018's header, REQ-PRO-006, REQ-PRO-008, REQ-UIX-003, DEC-073.
//
// Tone is the platform's six-value status vocabulary, not a colour per state:
//
//   draft              neutral, outline   nothing has happened to it yet
//   submitted          info               waiting on someone else
//   in_review          info               the same, one step on
//   changes_requested  live               it needs the MEMBER — as «قائمة
//                                         انتظار» and «يُغلق التسجيل قريبًا» do
//   approved           success
//   rejected           error
//
// Every state carries its own words, so colour is never the only channel.
// Not `async`: `useTranslations` works in a synchronous server component and
// in a client one alike, so the same badge renders on both pages.

const TONE: Record<ProposalState, { tone: Tone; outline?: boolean }> = {
  draft: { tone: "neutral", outline: true },
  submitted: { tone: "info" },
  in_review: { tone: "info" },
  changes_requested: { tone: "live" },
  approved: { tone: "success" },
  rejected: { tone: "error" },
};

export function ProposalStatusBadge({ state, size = "md" }: { state: ProposalState; size?: "sm" | "md" }) {
  const t = useTranslations("proposals.proposal.state");
  const { tone, outline } = TONE[state];
  return (
    <Badge tone={tone} outline={outline} size={size}>
      {t(state)}
    </Badge>
  );
}
