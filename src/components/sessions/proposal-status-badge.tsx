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

// ★ Two states are worded to the proposer — «مسودة عندك», «بانتظار تعديلك». Anyone else looking (an
// admin reviewing, a co-presenter) reads them in the third person, or the badge tells the admin the
// draft is theirs (wave 10's carried finding). `viewerIsProposer` defaults to true: SCR-017 lists only
// the member's own proposals.
const OTHERS_WORDED: ReadonlySet<ProposalState> = new Set(["draft", "changes_requested"]);

export function ProposalStatusBadge({
  state,
  size = "md",
  viewerIsProposer = true,
}: {
  state: ProposalState;
  size?: "sm" | "md";
  viewerIsProposer?: boolean;
}) {
  const t = useTranslations("proposals.proposal");
  const { tone, outline } = TONE[state];
  const others = !viewerIsProposer && OTHERS_WORDED.has(state);
  return (
    <Badge tone={tone} outline={outline} size={size}>
      {others ? t(`stateForOthers.${state as "draft" | "changes_requested"}`) : t(`state.${state}`)}
    </Badge>
  );
}
