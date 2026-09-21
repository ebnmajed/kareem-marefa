// The proposal's state badge speaks to the proposer — «مسودة عندك», «بانتظار تعديلك» — and in the third
// person to anyone else (wave 10's carried finding: an admin reviewing someone's draft read «عندك»).
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { ProposalStatusBadge } from "@/components/sessions/proposal-status-badge";
import proposals from "@/messages/ar/proposals.json";

const wrap = (node: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="ar" messages={proposals}>
      {node}
    </NextIntlClientProvider>,
  );

describe("ProposalStatusBadge", () => {
  it("speaks to the proposer by default, as SCR-017's own list always has", () => {
    wrap(<ProposalStatusBadge state="draft" />);
    expect(screen.getByText("مسودة عندك")).toBeInTheDocument();
  });

  it("★ tells anyone else it is somebody's draft, not theirs", () => {
    wrap(<ProposalStatusBadge state="draft" viewerIsProposer={false} />);
    expect(screen.getByText("مسودة لم تُقدَّم بعد")).toBeInTheDocument();
    expect(screen.queryByText("مسودة عندك")).toBeNull();
  });

  it("★ and that the changes are the proposer's to make", () => {
    wrap(<ProposalStatusBadge state="changes_requested" viewerIsProposer={false} />);
    expect(screen.getByText("بانتظار تعديل صاحب المقترح")).toBeInTheDocument();
  });

  it("leaves the states that name no one unchanged for everyone", () => {
    wrap(<ProposalStatusBadge state="approved" viewerIsProposer={false} />);
    expect(screen.getByText("مقبول")).toBeInTheDocument();
  });
});
