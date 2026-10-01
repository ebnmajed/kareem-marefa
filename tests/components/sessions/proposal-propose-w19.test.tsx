// SCR-017 rebuilt from `Propose.dc.html` (REQ-UIX-067, DEC-213, DEC-214) — what the rebuild added to the form, beside
// `proposal-form.test.tsx`, which pins the form model and passes untouched.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { ProposalForm } from "@/app/[locale]/app/propose/proposal-form";
import type { ProposeState } from "@/app/[locale]/app/propose/state";
import proposals from "@/messages/ar/proposals.json";
import ui from "@/messages/ar/ui.json";
import admin from "@/messages/ar/admin.json";

const messages = { ...proposals, ...ui, admin: { combobox: admin.admin.combobox } };
const form = proposals.proposals.propose.form;
const CATEGORY = "4f2c9b1e-7d3a-4c8e-9b2f-1a6d5e8c3b70";

let posted: FormData | null = null;
async function capture(prev: ProposeState, formData: FormData): Promise<ProposeState> {
  posted = formData;
  return prev;
}

function draw(earn?: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ProposalForm mode="create" action={capture} categories={[{ id: CATEGORY, name: "فني" }]} members={[]} maxCoPresenters={2} maxCoPresentersLabel="يمكنك تسمية زميلين" earn={earn} />
    </NextIntlClientProvider>,
  );
}

describe("SCR-017 — the rebuilt form", () => {
  it("the level is three chips in a required group, introductory by default, and a press posts the chosen one", async () => {
    draw();
    const group = screen.getByRole("radiogroup", { name: new RegExp(form.levelLabel) });
    expect(group).toHaveAttribute("aria-required", "true");
    expect(group.querySelector("legend")).toHaveTextContent(`${form.levelLabel} ${ui.ui.field.required}`);
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(group).getByRole("radio", { name: form.levelIntroductory })).toBeChecked();

    fireEvent.click(within(group).getByText(form.levelAdvanced));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: form.submit }));
    });
    expect(posted?.get("level")).toBe("advanced");
    expect(posted?.get("intent")).toBe("submit");
  });

  it("★ the four required fields say «مطلوب», and no «(اختياري)» marker is drawn (REQ-UIX-011, DEC-214 D6)", () => {
    const { container } = draw();
    const marks = [...container.querySelectorAll("label, legend")].filter((el) => el.textContent?.includes(ui.ui.field.required));
    expect(marks).toHaveLength(4);
    expect(container.textContent).not.toContain(form.optional);
  });

  it("★ both actions sit in the named bar INSIDE the form, so each submits it with its intent", () => {
    const { container } = draw();
    const bar = screen.getByRole("group", { name: form.actionsLabel });
    expect(container.querySelector("form")?.contains(bar)).toBe(true);
    expect(within(bar).getByRole("button", { name: form.submit })).toHaveAttribute("value", "submit");
    expect(within(bar).getByRole("button", { name: form.saveDraft })).toHaveAttribute("value", "draft");
  });

  it("★ REQ-PRO-001 — no date, time or venue control, by type and by name", () => {
    const { container } = draw();
    for (const el of container.querySelectorAll("input, select, textarea")) {
      const input = el as HTMLInputElement;
      expect(["date", "time", "datetime-local", "week", "month"]).not.toContain(input.type);
      expect(input.name).not.toMatch(/date|time|venue|location|capacity|deadline|starts|ends/i);
    }
  });

  it("the earn panel the page builds is drawn between section 2 and the bar; absent, nothing takes its place", () => {
    draw(<p>+60 للتقديم</p>);
    expect(screen.getByText("+60 للتقديم")).toBeInTheDocument();
  });

  it("the two sections are h2s with their number, the first in the accent", () => {
    draw();
    const topic = screen.getByRole("heading", { level: 2, name: new RegExp(form.sectionTopic) });
    const people = screen.getByRole("heading", { level: 2, name: new RegExp(form.sectionPeople) });
    expect(topic.querySelector("[aria-hidden]")).toHaveClass("bg-accent");
    expect(people.querySelector("[aria-hidden]")).not.toHaveClass("bg-accent");
  });

  it("the duration's step stays 5 (DEC-214 D5) and the counter reads the schema's limits (DEC-213 §5.94)", () => {
    draw();
    expect(screen.getByRole("spinbutton", { name: new RegExp(form.durationLabel) })).toHaveAttribute("step", "5");
    expect(screen.getByText("0 من 150")).toBeInTheDocument();
    expect(screen.getByText(/^0 من 2,?000$/)).toBeInTheDocument();
  });
});

describe("REQ-INT-004 — the new proposal components", () => {
  const DIR = "src/components/proposals";
  const PHYSICAL = /\b(?:ml|mr|pl|pr|border-l|border-r|rounded-l|rounded-r|left|right)-(?:\[|\d|auto|px|full)|\btext-(?:left|right)\b/;
  it("use logical properties only, and never clip a text line", () => {
    for (const f of readdirSync(join(process.cwd(), DIR))) {
      const source = readFileSync(join(process.cwd(), DIR, f), "utf8");
      for (const line of source.split("\n")) expect(line.match(PHYSICAL), `${f}: ${line.trim()}`).toBeNull();
      expect(source).not.toMatch(/overflow-hidden|overflow:\s*hidden/);
    }
  });
});
