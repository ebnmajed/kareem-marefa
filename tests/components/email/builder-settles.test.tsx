// One placement, one frame request — wave 23, REQ-UIX-112. The canvas's frame is the renderer's answer to the
// committed document; it is asked for again only when the document changes, never by its own measuring.
import { NextIntlClientProvider } from "next-intl";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import notificationsAr from "@/messages/ar/notifications.json";
import uiAr from "@/messages/ar/ui.json";

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { EmailBuilder } from "@/components/email/builder";

const DOC = { schemaVersion: 1, blocks: [{ type: "paragraph", id: "p1", text: "أهلًا" }] };

describe("the canvas settles", () => {
  it("★ placing a layout asks the renderer for one new frame, and measuring it asks for none", async () => {
    const submits = vi.fn();
    HTMLFormElement.prototype.requestSubmit = function requestSubmit() {
      if (this.getAttribute("target")?.startsWith("mail-canvas")) submits();
    };
    render(
      <NextIntlClientProvider locale="ar" messages={{ ...notificationsAr, ...uiAr }} timeZone="Asia/Riyadh">
        <ToastProvider closeLabel="إغلاق">
          <EmailBuilder
            messageKey="MSG-reminder_1d"
            name="تذكير"
            initialSubject="s"
            initialBlocks={DOC}
            templateId={null}
            savedAt={null}
            isStringRow={false}
            offered={["member.name", "url"]}
            timeZone="Asia/Riyadh"
            locale="ar"
            session={null}
            email={null}
            action={vi.fn()}
            sendTest={vi.fn()}
            restore={vi.fn()}
          />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    const frame = document.querySelector<HTMLIFrameElement>('iframe[name^="mail-canvas"]')!;
    const load = async () => act(async () => void frame.dispatchEvent(new Event("load")));
    await load();
    const initial = submits.mock.calls.length;
    expect(initial).toBe(1);

    fireEvent.click(screen.getAllByRole("button", { name: "عمودان، الثاني أعرض" })[0]!);
    fireEvent.click(document.querySelector("[data-canvas-slot]")!);
    expect(submits).toHaveBeenCalledTimes(initial + 1);
    // The frame answers, and the canvas measures it — several times over — without asking again.
    for (let i = 0; i < 5; i++) await load();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(submits).toHaveBeenCalledTimes(initial + 1);
  });

  it("★ measuring settles: once the frame has loaded, the canvas stops reading it", async () => {
    HTMLFormElement.prototype.requestSubmit = function requestSubmit() {};
    render(
      <NextIntlClientProvider locale="ar" messages={{ ...notificationsAr, ...uiAr }} timeZone="Asia/Riyadh">
        <ToastProvider closeLabel="إغلاق">
          <EmailBuilder messageKey="MSG-reminder_1d" name="تذكير" initialSubject="s" initialBlocks={DOC} templateId={null} savedAt={null} isStringRow={false} offered={["member.name", "url"]} timeZone="Asia/Riyadh" locale="ar" session={null} email={null} action={vi.fn()} sendTest={vi.fn()} restore={vi.fn()} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    const frame = document.querySelector<HTMLIFrameElement>('iframe[name^="mail-canvas"]')!;
    const real = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentDocument")!;
    let reads = 0;
    Object.defineProperty(frame, "contentDocument", { get() { reads++; return real.get!.call(this); } });
    await act(async () => void frame.dispatchEvent(new Event("load")));
    const settled = reads;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(reads).toBe(settled);
    expect(settled).toBeLessThan(5);
  });
});
