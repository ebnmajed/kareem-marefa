// Wave 27 — SCR-048's domains, and the save that asks first (REQ-ADM-024, REQ-PRF-012, DEC-254 §2.7, DEC-255 §4;
// STORY-ADM-012). The database's half — who moves, the token, the audit — is `tests/rls/company-sweep.test.ts`; this
// file proves the action's two steps and what the form says, with `saveCompanyWithDomains()` mocked.
import { createTranslator } from "next-intl";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import adminAr from "@/messages/ar/admin.json";
import uiAr from "@/messages/ar/ui.json";
import type { CompanySave } from "@/lib/dal/admin-lists";

const messages = { ...adminAr, ...uiAr };

const save = vi.fn<(locale: string, input: { companyId: string | null; name: string; teamColorHex: string | null; domains: string[]; confirm: boolean; expected: string | null }) => Promise<CompanySave>>();
vi.mock("@/lib/dal/admin-lists", async () => {
  const { z } = await import("zod");
  return {
    companyInput: z.object({ name: z.string().trim().min(1).max(120) }).strict(),
    saveCompanyWithDomains: (...a: unknown[]) => save(...(a as Parameters<typeof save>)),
    setCompanyActive: vi.fn(),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const { saveCompany } = await import("@/app/[locale]/app/admin/companies/actions");
const { CompanyForm } = await import("@/app/[locale]/app/admin/companies/company-form");
const { emptyCompanyState, domainLines } = await import("@/app/[locale]/app/admin/companies/state");
type CompanyState = typeof emptyCompanyState;

const ID = "11111111-1111-4111-8111-111111111111";
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

beforeEach(() => save.mockReset());

describe("saveCompany — a dry run, then the confirm (ruling 7)", () => {
  it("the domains are the textarea's lines, trimmed, empties dropped", () => {
    expect(domainLines(" acme.example\n\n@acme.sa ,  b.example ")).toEqual(["acme.example", "@acme.sa", "b.example"]);
  });

  it("a dry run that moves nobody saves without asking — the confirm carries the dry run's own token", async () => {
    save.mockResolvedValueOnce({ status: "preview", moving: 0, held: 2, token: "t0", companyName: "أكمي" });
    save.mockResolvedValueOnce({ status: "saved", companyId: ID, moved: 0, held: 2 });
    const state = await saveCompany("ar", ID, emptyCompanyState, form({ name: "أكمي", teamColour: "none", domains: "acme.example" }));
    expect(state.saved).toBe(true);
    expect(save.mock.calls.map(([, i]) => [i.confirm, i.expected])).toEqual([[false, null], [true, "t0"]]);
    expect(save.mock.calls[0][1]).toMatchObject({ companyId: ID, name: "أكمي", teamColorHex: null, domains: ["acme.example"] });
  });

  it("a dry run that moves someone asks: the two counts and the destination, nothing saved", async () => {
    save.mockResolvedValueOnce({ status: "preview", moving: 3, held: 1, token: "t1", companyName: "أكمي" });
    const state = await saveCompany("ar", ID, emptyCompanyState, form({ name: "أكمي", domains: "acme.example" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(state.saved).toBe(false);
    expect(state.confirm).toEqual({ moving: 3, held: 1, token: "t1", companyName: "أكمي", changed: false });
    expect(state.attempt).toBe(1); // so the fields echo what was typed while the form asks
  });

  it("the confirm posts the token; «changed» asks again with the new numbers", async () => {
    save.mockResolvedValueOnce({ status: "changed", moving: 4, held: 1, token: "t2", companyName: "أكمي" });
    const state = await saveCompany("ar", ID, emptyCompanyState, form({ name: "أكمي", domains: "acme.example", confirm: "1", token: "t1" }));
    expect(save.mock.calls[0][1]).toMatchObject({ confirm: true, expected: "t1" });
    expect(state.confirm).toEqual({ moving: 4, held: 1, token: "t2", companyName: "أكمي", changed: true });
  });

  it("refused domains come back per domain, on the field", async () => {
    save.mockResolvedValueOnce({ status: "invalid", errors: [{ domain: "bad", reason: "malformed" }] });
    const state = await saveCompany("ar", ID, emptyCompanyState, form({ name: "أكمي", domains: "bad" }));
    expect(state.errors.domains).toBe("domainsInvalid");
    expect(state.domainErrors).toEqual([{ domain: "bad", reason: "malformed" }]);
  });
});

describe("the form — domains are LTR text in an RTL form", () => {
  function renderWith(state: CompanyState) {
    render(
      <NextIntlClientProvider locale="ar" messages={messages}>
        <ToastProvider closeLabel="إغلاق">
          <main>
            <CompanyForm
              action={async () => state}
              company={{ id: ID, name: "أكمي", deactivatedAt: null, memberCount: 0, activeMemberCount: 0, teamColor: null, domains: ["acme.example", "acme.sa"] }}
              closeHref="/app/admin/companies"
            />
          </main>
        </ToastProvider>
      </NextIntlClientProvider>,
    );
  }
  const submit = () => fireEvent.submit(document.querySelector("form")!);

  it("the field is the company's domains, one per line, left to right", () => {
    renderWith(emptyCompanyState);
    const field = screen.getByLabelText("النطاقات", { exact: false });
    expect(field).toHaveAttribute("dir", "ltr");
    expect(field).toHaveValue("acme.example\nacme.sa");
  });

  it("a refusal names each domain in <bdi dir=ltr> and the company it is on", async () => {
    renderWith({
      ...emptyCompanyState,
      attempt: 1,
      errors: { domains: "domainsInvalid" },
      domainErrors: [
        { domain: "not a domain", reason: "malformed" },
        { domain: "taken.example", reason: "taken", company: "شركة أخرى" },
      ],
    });
    submit();
    const taken = await screen.findByText("taken.example");
    expect(taken.tagName).toBe("BDI");
    expect(taken).toHaveAttribute("dir", "ltr");
    expect(taken.parentElement).toHaveTextContent("taken.example على شركة «شركة أخرى».");
    expect(screen.getByText("not a domain").parentElement).toHaveTextContent("ليس نطاقًا");
  });

  it("★ asks first: the two counts and the destination, and «انقل واحفظ» submits this form by form=", async () => {
    renderWith({ ...emptyCompanyState, attempt: 1, confirm: { moving: 3, held: 1, token: "t1", companyName: "أكمي", changed: false } });
    submit();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("ينتقل 3 أعضاء إلى «أكمي»");
    expect(dialog).toHaveTextContent("يبقى عضو واحد مكانه لأن مشرفًا وضعه يدويًا");
    const go = within(dialog).getByRole("button", { name: "انقل واحفظ" });
    expect(go).toHaveAttribute("type", "submit");
    expect(go).toHaveAttribute("form", "company-form");
    expect(go).toHaveAttribute("name", "confirm");
    expect((document.querySelector('input[name="token"]') as HTMLInputElement).value).toBe("t1");
    expect((await axe.run(dialog)).violations).toEqual([]);
  });

  // ★ The wiring of the confirm: form=, confirm=1 and the token reach the action. jsdom does NOT reproduce the defect the
  // wave-27 e2e found (the button disabling itself from its own click before activation) — the e2e is that proof.
  it("★ «انقل واحفظ» really submits the form, with confirm=1 and the dry run's token", async () => {
    const calls: FormData[] = [];
    const action = vi.fn(async (_prev: CompanyState, fd: FormData): Promise<CompanyState> => {
      calls.push(fd);
      return calls.length === 1
        ? { ...emptyCompanyState, attempt: 1, values: { name: "أكمي", domains: "acme.example" }, confirm: { moving: 2, held: 0, token: "t9", companyName: "أكمي", changed: false } }
        : { ...emptyCompanyState, saved: true };
    });
    render(
      <NextIntlClientProvider locale="ar" messages={messages}>
        <ToastProvider closeLabel="إغلاق">
          <main>
            <CompanyForm action={action} company={{ id: ID, name: "أكمي", deactivatedAt: null, memberCount: 0, activeMemberCount: 0, teamColor: null, domains: [] }} closeHref="/app/admin/companies" />
          </main>
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "احفظ" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "انقل واحفظ" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0].get("confirm")).toBeNull();
    expect(calls[1].get("confirm")).toBe("1");
    expect(calls[1].get("token")).toBe("t9");
  });

  it("«changed» says so above the new numbers; nobody held is not said", async () => {
    renderWith({ ...emptyCompanyState, attempt: 1, confirm: { moving: 2, held: 0, token: "t2", companyName: "أكمي", changed: true } });
    submit();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("تغيّر العدد");
    expect(dialog).toHaveTextContent("ينتقل عضوان إلى «أكمي»");
    expect(dialog).not.toHaveTextContent("يبقى");
  });
});

describe("the six plural forms are written (ar)", () => {
  const t = createTranslator({ locale: "ar", messages: adminAr, namespace: "admin.companies" });
  it.each([
    [0, "لا ينتقل أحد"],
    [1, "ينتقل عضو واحد"],
    [2, "ينتقل عضوان"],
    [3, "ينتقل 3 أعضاء"],
    [11, "ينتقل 11 عضوًا"],
    [100, "ينتقل 100 عضو"],
  ])("moveCount %i", (n, text) => {
    expect(t.markup("moveCount", { count: n, value: String(n), name: "أكمي", t: (c) => c, bdi: (c) => c })).toContain(text);
  });
  it.each([
    [1, "يبقى عضو واحد"],
    [2, "يبقى عضوان"],
    [3, "يبقى 3 أعضاء"],
    [11, "يبقى 11 عضوًا"],
    [100, "يبقى 100 عضو"],
  ])("heldCount %i", (n, text) => {
    expect(t.markup("heldCount", { count: n, value: String(n), bdi: (c) => c })).toContain(text);
  });
});
