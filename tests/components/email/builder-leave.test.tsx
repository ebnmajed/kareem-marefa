// SCR-058's builder asks before ANY in-app link leaves unsaved work — wave 28, `DEC-259` §2.7.
//
// Until this wave the leave dialog was wired to the builder's own back button only, so every other link left unasked.
// The listener is `profile-edit.tsx`'s: a plain press on a same-origin link that neither downloads nor opens a tab.
import { NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import notificationsAr from "@/messages/ar/notifications.json";
import uiAr from "@/messages/ar/ui.json";

const push = vi.hoisted(() => vi.fn());
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/components/email/email-canvas", () => ({ EmailCanvas: () => <div data-testid="canvas" /> }));

import { EmailBuilder } from "@/components/email/builder";

beforeAll(() => {
  HTMLFormElement.prototype.requestSubmit = function requestSubmit() {};
});
afterEach(() => {
  push.mockClear();
  document.querySelectorAll("a[data-outside]").forEach((a) => a.remove());
});

const messages = { ...notificationsAr, ...uiAr };
const DOC = { schemaVersion: 1, blocks: [{ type: "paragraph", id: "p1", text: "أهلًا {{member.name}}" }] };

function mount() {
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
          action={vi.fn() as never}
          sendTest={vi.fn(async () => ({ status: "queued" })) as never}
          restore={vi.fn()}
        />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

/** A link the builder does not render itself — the frame's, or any other on the page. */
function outsideLink(href: string, attrs: Record<string, string> = {}) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = "خارج";
  a.dataset.outside = "";
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  // jsdom does not navigate, but an un-prevented click on a link is what «left unasked» looks like.
  document.body.append(a);
  return a;
}

const edit = () => fireEvent.change(screen.getAllByLabelText(/الموضوع/)[0]!, { target: { value: "بعد غد: {{title}}" } });
const asked = () => screen.queryByText("تغادر دون حفظ؟") !== null;

describe("the builder asks before any in-app link leaves unsaved work", { timeout: 20_000 }, () => {
  it("with nothing unsaved, a link is not asked about", () => {
    mount();
    const notPrevented = fireEvent.click(outsideLink("/ar/app/admin/emails"));
    expect(notPrevented).toBe(true);
    expect(asked()).toBe(false);
  });

  it("★ with unsaved changes, a link opens the question, and «غادر» goes where the link went — without the locale twice", () => {
    mount();
    edit();
    const notPrevented = fireEvent.click(outsideLink("/ar/app/admin/sessions?state=live#top"));
    expect(notPrevented).toBe(false);
    expect(asked()).toBe(true);
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "غادر" }));
    expect(push).toHaveBeenCalledExactlyOnceWith("/app/admin/sessions?state=live#top");
  });

  it("«ابقَ» stays, and nothing navigates", () => {
    mount();
    edit();
    fireEvent.click(outsideLink("/ar/app/admin/sessions"));
    fireEvent.click(screen.getByRole("button", { name: "ابقَ" }));
    expect(asked()).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("a download, a new tab, an /api/ link, another origin and a modified press are the browser's, not asked about", () => {
    mount();
    edit();
    expect(fireEvent.click(outsideLink("/ar/app/x", { download: "" }))).toBe(true);
    expect(fireEvent.click(outsideLink("/ar/app/x", { target: "_blank" }))).toBe(true);
    expect(fireEvent.click(outsideLink("/api/mail/qr?x=1"))).toBe(true);
    expect(fireEvent.click(outsideLink("https://example.com/"))).toBe(true);
    expect(fireEvent.click(outsideLink("/ar/app/x"), { metaKey: true })).toBe(true);
    expect(asked()).toBe(false);
  });
});
