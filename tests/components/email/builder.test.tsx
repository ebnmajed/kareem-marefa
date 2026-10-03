// SCR-058's block builder — wave 23, REQ-UIX-112, REQ-NTF-011, DEC-093, DEC-238 §4.
//
// The canvas is the renderer's frame and is driven in e2e; here it is a stand-in that shows the slots the builder
// hands it, so the TAP path — arm in the library, place at a slot — is proven without a frame. And #55's rule, which
// `block-editor-test-send.test.tsx` held for the editor this replaces (STATUS ledger): the test send waits while the
// subject or the document differs from the save, and comes back when the server says the save landed.
import { NextIntlClientProvider } from "next-intl";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { EmailCanvasProps } from "@/components/email/email-canvas";
import { ToastProvider } from "@/components/ui/toast";
import notificationsAr from "@/messages/ar/notifications.json";
import uiAr from "@/messages/ar/ui.json";

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/email/email-canvas", () => ({
  EmailCanvas: (props: EmailCanvasProps) => (
    <div data-testid="canvas">
      {props.doc.rows.map((row) => (
        <button key={row.id} type="button" onClick={() => props.onSelect(row.columns[0]![0]!)}>
          {`صف ${row.columns[0]![0]}`}
        </button>
      ))}
      {props.slots ? (
        <button type="button" onClick={() => props.slots!.onPlace({ index: props.doc.rows.length })}>
          أضف هنا
        </button>
      ) : null}
    </div>
  ),
}));

import { EmailBuilder } from "@/components/email/builder";

beforeAll(() => {
  HTMLFormElement.prototype.requestSubmit = function requestSubmit() {};
});

const messages = { ...notificationsAr, ...uiAr };
const DOC = { schemaVersion: 1, blocks: [{ type: "paragraph", id: "p1", text: "أهلًا {{member.name}}" }] };

function mount(action = vi.fn(async () => ({ saved: true, values: { updatedAt: "2026-10-03T12:00:00Z" }, errors: {}, attempt: 1 }) as never)) {
  const sendTest = vi.fn(async () => ({ status: "queued" }));
  render(
    <NextIntlClientProvider locale="ar" messages={messages} timeZone="Asia/Riyadh">
      <ToastProvider closeLabel="إغلاق">
        <EmailBuilder
          messageKey="MSG-reminder_1d"
          name="تذكير قبل الجلسة بيوم"
          initialSubject="غدًا: {{title}}"
          initialBlocks={DOC}
          templateId={null}
          savedAt={null}
          isStringRow={false}
          offered={["member.name", "title", "url", "session_id"]}
          timeZone="Asia/Riyadh"
          locale="ar"
          session={{ id: "s1", title: "أساسيات التصميم", startsAt: "2026-10-04T15:00:00Z", venue: "القاعة الكبرى" }}
          email="boss@kareem.example"
          action={action}
          sendTest={sendTest}
          restore={vi.fn()}
        />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { sendTest, action };
}

const openPreview = () => fireEvent.click(screen.getByRole("button", { name: "معاينة واختبار" }));
const testButton = () => screen.getByRole("button", { name: /أرسل اختبارًا إلى/ });

describe("EmailBuilder", () => {
  it("draws the bar and the rail in the artboard's order, الكتلة only with a selection", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "تذكير قبل الجلسة بيوم" })).toBeInTheDocument();
    const rail = screen.getByRole("tablist", { name: "أدوات المحرّر" });
    expect(within(rail).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["إضافة", "الأنماط", "التخطيطات", "الفحوصات"]);
    fireEvent.click(screen.getByRole("button", { name: "صف p1" }));
    expect(within(rail).getAllByRole("tab").map((tab) => tab.textContent)).toContain("الكتلة");
  });

  it("★ a tap ARMS a block in the library and a tap on a slot PLACES it — no drag (DEC-093)", () => {
    mount();
    expect(screen.queryByRole("button", { name: "أضف هنا" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "رمز QR" }));
    expect(screen.getByRole("button", { name: "رمز QR" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "أضف هنا" }));
    expect(screen.getAllByRole("button", { name: /^صف / })).toHaveLength(2);
    // Placed and selected: الكتلة opens on it, and nothing is armed any more.
    expect(screen.getByRole("tab", { name: "الكتلة" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: "أضف هنا" })).toBeNull();
  });

  it("the QR it placed is BLOCKING until it has an alt — the rail counts it and «احفظ وفعّل» waits", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "رمز QR" }));
    fireEvent.click(screen.getByRole("button", { name: "أضف هنا" }));
    expect(screen.getByRole("tab", { name: /الفحوصات/ }).textContent).toContain("1");
    expect(screen.getByRole("button", { name: "احفظ وفعّل" })).toBeDisabled();
  });

  it("★ the test send is enabled for an untouched design and goes to the admin's own address", async () => {
    const { sendTest } = mount();
    openPreview();
    expect(testButton()).toBeEnabled();
    expect(testButton().textContent).toContain("boss@kareem.example");
    await act(async () => fireEvent.click(testButton()));
    expect(sendTest).toHaveBeenCalledTimes(1);
  });

  it("★ it waits while the subject differs from the save, says so, and comes back when the save lands (#55)", async () => {
    const { sendTest } = mount();
    fireEvent.change(screen.getAllByLabelText(/الموضوع/)[0]!, { target: { value: "غدًا معدّل: {{title}}" } });
    openPreview();
    expect(testButton()).toBeDisabled();
    expect(screen.getByText("احفظ قبل الاختبار.")).toBeTruthy();
    fireEvent.click(testButton());
    expect(sendTest).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "احفظ وفعّل" })));
    openPreview();
    await waitFor(() => expect(testButton()).toBeEnabled());
  });

  it("the saved mark is the server's time, never the click's", async () => {
    mount();
    expect(screen.getByRole("status").textContent).toBe("التصميم الافتراضي");
    fireEvent.change(screen.getAllByLabelText(/الموضوع/)[0]!, { target: { value: "جديد {{title}}" } });
    expect(screen.getByRole("status").textContent).toBe("مسودة");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "احفظ وفعّل" })));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/^محفوظ · /));
  });

  it("★ one layout in the document: at a desktop width the phone's checks are not rendered, so a finding is listed once", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    try {
      mount();
      expect(screen.queryByText("يُحرَّر البريد على شاشة أعرض.")).toBeNull();
      expect(screen.getAllByLabelText(/الموضوع/)).toHaveLength(1);
    } finally {
      window.matchMedia = original;
    }
  });

  it("and at a phone width only the phone's notice and checks, with «معاينة واختبار» still in the bar", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    try {
      mount();
      expect(screen.getByText("يُحرَّر البريد على شاشة أعرض.")).toBeInTheDocument();
      expect(screen.queryByRole("tablist", { name: "أدوات المحرّر" })).toBeNull();
      expect(screen.getByRole("button", { name: "معاينة واختبار" })).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });

  it("names the real session the preview uses", () => {
    mount();
    openPreview();
    expect(screen.getByText(/أساسيات التصميم/)).toBeInTheDocument();
  });
});
