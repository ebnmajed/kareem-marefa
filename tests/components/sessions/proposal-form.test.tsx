// SCR-017's form model, wave 7 — REQ-UIX-009, REQ-UIX-010, REQ-UIX-011,
// `16` §8.2 items 4–7, DEC-141.
//
// The M9 form already kept values, linked the summary and rewarded a fix while
// typing. What these pin is what wave 7 adds: blur checks EVERY field (not only
// the ones the server refused), never before the first submit; the summary
// counts and reassures; «المتبقّي» counts the required fields still unfinished.
// The strings are the real Arabic catalogue.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { ProposalForm } from "@/app/[locale]/app/propose/proposal-form";
import { PROPOSAL_VALUE_FIELDS, type ProposalField, type ProposeState } from "@/app/[locale]/app/propose/state";
import { formStateFrom, withErrors } from "@/lib/form-state";
import proposals from "@/messages/ar/proposals.json";
import ui from "@/messages/ar/ui.json";
import admin from "@/messages/ar/admin.json";

// `ui/combobox` still reads its own three strings from `admin.combobox`.
const messages = { ...proposals, ...ui, admin: { combobox: admin.admin.combobox } };
const form = proposals.proposals.propose.form;
const errors = proposals.proposals.propose.errors;
const CATEGORY = "4f2c9b1e-7d3a-4c8e-9b2f-1a6d5e8c3b70";

/** What `submitProposal` returns for an empty form: the three required fields refused. */
async function refuseEmpty(prev: ProposeState, formData: FormData): Promise<ProposeState> {
  const captured = formStateFrom<ProposalField>(formData, { fields: PROPOSAL_VALUE_FIELDS, lists: ["coPresenters"], previous: prev });
  return withErrors(captured, { title: "titleRequired", abstract: "abstractRequired", categoryId: "categoryRequired" });
}

const MATE = "7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";

function renderForm(members: { id: string; displayName: string | null; jobTitle: string | null }[] = []) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ProposalForm mode="create" action={refuseEmpty} categories={[{ id: CATEGORY, name: "فني" }]} members={members} maxCoPresenters={4} maxCoPresentersLabel="يمكنك تسمية 4 زملاء" />
    </NextIntlClientProvider>,
  );
}

const title = () => screen.getByRole("textbox", { name: new RegExp(form.titleLabel) });
const duration = () => screen.getByRole("spinbutton", { name: new RegExp(form.durationLabel) });

async function submit() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: form.submit }));
  });
}

describe("ProposalForm — before the first submit", () => {
  it("leaving an empty required field says nothing", () => {
    renderForm();
    fireEvent.blur(title());
    expect(title()).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText(errors.titleRequired)).toBeNull();
  });

  it("counts the three required fields still unfinished, and counts down as they are filled", () => {
    renderForm();
    expect(screen.getByText("المتبقّي: 3 حقول مطلوبة")).toBeInTheDocument();
    fireEvent.change(title(), { target: { value: "كيف اختصرنا وقت التقارير" } });
    expect(screen.getByText("المتبقّي: حقلان مطلوبان")).toBeInTheDocument();
  });
});

describe("ProposalForm — after a failed submit", () => {
  it("the summary counts the failures and says the typed text is kept", async () => {
    renderForm();
    await submit();
    const summary = screen.getByRole("alert");
    expect(summary).toHaveTextContent("لم نستطع إرسال المقترح — 3 حقول تحتاج تصحيحًا");
    expect(summary).toHaveTextContent("اضغط على أيٍّ منها للانتقال إليه. ما كتبته محفوظ كما هو.");
  });

  it("★ the summary lists exactly the errors on the page — a field broken after the submit joins it, a fixed one leaves", async () => {
    renderForm();
    await submit();
    const links = () => screen.getByRole("alert").querySelectorAll("a");
    expect(links()).toHaveLength(3);

    fireEvent.change(duration(), { target: { value: "5" } });
    fireEvent.blur(duration());
    expect(links()).toHaveLength(4);
    expect(screen.getByRole("alert")).toHaveTextContent("لم نستطع إرسال المقترح — 4 حقول تحتاج تصحيحًا");

    fireEvent.change(title(), { target: { value: "كيف اختصرنا وقت التقارير" } });
    fireEvent.change(duration(), { target: { value: "45" } });
    expect(links()).toHaveLength(2);
    // The dual, not the plural: «أيٍّ منهما».
    expect(screen.getByRole("alert")).toHaveTextContent("حقلان يحتاجان تصحيحًا");
    expect(screen.getByRole("alert")).toHaveTextContent("اضغط على أيٍّ منهما للانتقال إليه.");
  });

  it("★ blur checks a field the server did NOT refuse — a duration typed after the submit", async () => {
    renderForm();
    await submit();
    expect(screen.queryByText(errors.durationInvalid)).toBeNull();
    fireEvent.change(duration(), { target: { value: "5" } });
    fireEvent.blur(duration());
    expect(screen.getByText(errors.durationInvalid)).toBeInTheDocument();
    expect(duration()).toHaveAttribute("aria-invalid", "true");
  });

  it("reward early: a refused field clears while typing, before blur", async () => {
    renderForm();
    await submit();
    expect(screen.getByText(errors.titleRequired)).toBeInTheDocument();
    fireEvent.change(title(), { target: { value: "كيف اختصرنا وقت التقارير" } });
    expect(screen.queryByText(errors.titleRequired)).toBeNull();
  });

  it("punish late: emptying a field again says nothing until blur, then the right message", async () => {
    renderForm();
    await submit();
    fireEvent.change(title(), { target: { value: "كيف اختصرنا وقت التقارير" } });
    fireEvent.change(title(), { target: { value: "قص" } });
    expect(screen.queryByText(errors.titleTooShort)).toBeNull();
    fireEvent.blur(title());
    expect(screen.getByText(errors.titleTooShort)).toBeInTheDocument();
  });
});

describe("ProposalForm — co-presenters through ui/combobox (REQ-PRO-003, REQ-UIX-008, R2)", () => {
  it("finds a colleague by an Arabic-normalised search, names them as a chip, writes the id for the action — and keeps them after a failed submit", async () => {
    const { container } = renderForm([{ id: MATE, displayName: "نورة القحطاني", jobTitle: "محلّلة بيانات" }]);
    const search = screen.getByRole("combobox", { name: new RegExp(form.coPresentersLabel) });
    // The Field's hint reaches the input (654ec91).
    expect(search.getAttribute("aria-describedby")).toContain("coPresenters-hint");

    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "نوره" } }); // taa marbuta folded
    fireEvent.click(screen.getByRole("option", { name: /نورة القحطاني/ }));

    const hidden = () => [...container.querySelectorAll<HTMLInputElement>('input[type="hidden"][name="coPresenters"]')].map((i) => i.value);
    expect(hidden()).toEqual([MATE]);
    expect(screen.getByRole("button", { name: "إزالة نورة القحطاني" })).toBeInTheDocument();

    await submit();
    expect(hidden()).toEqual([MATE]);
    expect(screen.getByRole("button", { name: "إزالة نورة القحطاني" })).toBeInTheDocument();
  });
});

describe("ProposalForm — edit (SCR-018's edit path, DEC-141)", () => {
  const initial = { title: "أتمتة الفواتير بلا برمجة", abstract: "تجربة عملية.", categoryId: CATEGORY, level: "advanced", targetAudience: "", expectedDurationMinutes: "45", adminNotes: "" };

  function renderEdit(allowDraft: boolean) {
    return render(
      <NextIntlClientProvider locale="ar" messages={messages}>
        <ProposalForm mode="edit" action={refuseEmpty} categories={[{ id: CATEGORY, name: "فني" }]} initial={initial} allowDraft={allowDraft} />
      </NextIntlClientProvider>,
    );
  }

  it("starts from the proposal as saved, with nothing invalid and nothing left to fill", () => {
    renderEdit(true);
    expect(title()).toHaveValue(initial.title);
    expect(duration()).toHaveValue(45);
    expect(title()).not.toHaveAttribute("aria-invalid");
    expect(screen.getByText("اكتملت الحقول المطلوبة")).toBeInTheDocument();
  });

  it("a change request is resubmitted, never saved back to a draft — one action, and no co-presenter list", () => {
    renderEdit(false);
    expect(screen.getByRole("button", { name: form.resubmit })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: form.saveDraft })).toBeNull();
    // A native <select> is a combobox too — name the one that would be the co-presenter search.
    expect(screen.queryByRole("combobox", { name: new RegExp(form.coPresentersLabel) })).toBeNull();
    expect(screen.getByText(form.presentersElsewhere)).toBeInTheDocument();
  });

  it("a draft keeps both actions", () => {
    renderEdit(true);
    expect(screen.getByRole("button", { name: form.submit })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: form.saveDraft })).toBeInTheDocument();
  });
});
