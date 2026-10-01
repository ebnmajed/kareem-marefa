// SCR-016 as the rebuilt page composes it — REQ-UIX-062, STORY-UIX-050 (`Host.dc.html`, DEC-208,
// DEC-209). Rendered against the real ar catalogue with the DAL mocked. What is pinned is the
// kept-behaviour table's host half (`docs/plan/notes/checkin.md` § B.2) and the artboard's regions:
//   · access is the RPC's: a null view is the refusal heading and nothing else (REQ-CHK-014);
//   · the code is ONE `p[dir=ltr]` whose text is the six characters, in two groups (B.0.4);
//   · the count, with «من M» and the walk-ins only when true;
//   · the switch shows the server's answer, with the ceiling as its auto-close time (REQ-CHK-015/016);
//   · revoke for anyone on the console; marking by hand for staff only (REQ-CHK-007, -008);
//   · no code outside the window, and each phase's sentence (REQ-CHK-004, bug (d)).
import type { ReactElement, ReactNode } from "react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import checkin from "@/messages/ar/checkin.json";
import sessions from "@/messages/ar/sessions.json";
import ui from "@/messages/ar/ui.json";
import type { HostViewData } from "@/lib/dal/checkin";

const messages = { ...checkin, ...sessions, ...ui };
let role: "admin" | "moderator" | "member" = "admin";

vi.mock("@/lib/dal/session", () => ({ requireSession: async () => ({ role }) }));
vi.mock("@/lib/dal/checkin", () => ({ getHostView: vi.fn(), listUncheckedConfirmedRsvps: vi.fn(async () => [{ memberId: "m1", displayName: "سارة" }]) }));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "checkin" }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock("@/components/ui/route-progress", () => ({ LinkPendingReporter: () => null }));
vi.mock("@/lib/realtime/channel", () => ({ subscribeToHostTopic: () => () => {} }));
vi.mock("@/app/[locale]/app/sessions/[id]/host/actions", () => {
  const bound = Object.assign(async () => {}, { bind: () => async () => {} });
  return { markManuallyAction: bound, revokeCodeAction: bound, setCheckInOpenAction: bound };
});

const { getHostView } = await import("@/lib/dal/checkin");
const { default: HostPage } = await import("@/app/[locale]/app/sessions/[id]/host/page");

const SESSION = "11111111-1111-4111-8111-111111111111";

const view = (over: Partial<HostViewData> = {}): HostViewData => ({
  sessionId: SESSION,
  code: "M7K2QX",
  phase: "live",
  startsAt: "2026-10-01T15:30:00.000Z",
  allowWalkIns: true,
  checkInOpen: true,
  validFrom: "2026-10-01T17:54:00.000Z",
  validUntil: "2026-10-01T18:06:00.000Z",
  checkInCount: 23,
  rotationSeconds: 600,
  consoleActive: true,
  day: null,
  dayCount: 1,
  timeZone: "Asia/Riyadh",
  title: "العرض في 5 شرائح",
  venueName: "قاعة الرياض",
  rotatesAt: "2026-10-01T18:04:00.000Z",
  readAt: "2026-10-01T17:57:48.000Z",
  graceSeconds: 120,
  closesAt: "2026-10-01T18:30:00.000Z",
  capacity: 40,
  walkInCount: 3,
  ...over,
});

async function show(data: HostViewData | null, search: Record<string, string> = {}) {
  vi.mocked(getHostView).mockResolvedValue(data);
  const tree = (await HostPage({ params: Promise.resolve({ locale: "ar", id: SESSION }), searchParams: Promise.resolve(search) })) as ReactElement;
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      {tree}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  role = "admin";
  vi.mocked(getHostView).mockReset();
});

describe("access (REQ-CHK-014)", () => {
  it("a viewer the RPC refuses sees the refusal heading and nothing of the console", async () => {
    await show(null);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("هذه الصفحة متاحة لمقدِّمي الجلسة والمشرفين فقط");
    expect(document.querySelector("p[dir='ltr']")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });
});

describe("the live console (Host.dc.html)", () => {
  it("the heading, and the code as ONE p[dir=ltr] of six characters in two groups of three", async () => {
    await show(view());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("رمز الحضور");
    const code = document.querySelector("p[dir='ltr']")!;
    expect(code.textContent).toBe("M7K2QX");
    expect([...code.children].map((c) => c.textContent)).toEqual(["M7K", "2QX"]);
    expect(code).toHaveAttribute("aria-live", "polite");
  });

  it("the session line isolates the title and the venue", async () => {
    await show(view());
    expect(screen.getByText("العرض في 5 شرائح").tagName).toBe("BDI");
    expect(screen.getByText("قاعة الرياض").tagName).toBe("BDI");
  });

  it("the count, of the capacity, with the walk-ins — and no walk-in policy sentence", async () => {
    await show(view());
    const label = screen.getByText("سجَّلوا حضورهم");
    const stat = label.parentElement!;
    expect(stat).toHaveTextContent("23");
    expect(stat).toHaveTextContent("من 40 مقعدًا · 3 حضور بلا حجز");
    expect(screen.queryByText(/يقبل الرمز من أي عضو|أصحاب الحجز المؤكد فقط/)).toBeNull();
  });

  it("walk-ins off: the count says nothing of them", async () => {
    await show(view({ allowWalkIns: false, walkInCount: 0 }));
    expect(screen.getByText("سجَّلوا حضورهم").parentElement).not.toHaveTextContent("بلا حجز");
  });

  it("★ the switch shows the server's answer, and the ceiling as its auto-close time (REQ-CHK-015, -016)", async () => {
    await show(view());
    const toggle = screen.getByRole("switch", { name: "تسجيل الحضور مفتوح" });
    expect(toggle).toBeChecked();
    expect(screen.getByText("يُغلق تلقائيًا 9:30 م")).toBeInTheDocument();
  });

  it("closed while live: the switch off with its hint, and the code still on the wall (DEC-209 D11)", async () => {
    await show(view({ checkInOpen: false }));
    expect(screen.getByRole("switch", { name: "تسجيل الحضور مفتوح" })).not.toBeChecked();
    expect(screen.getByText(/لن يُقبل أي رمز جديد/)).toBeInTheDocument();
    expect(document.querySelector("p[dir='ltr']")!.textContent).toBe("M7K2QX");
  });

  it("revoke is the danger outline; marking by hand is offered to staff", async () => {
    await show(view());
    expect(screen.getByRole("button", { name: "أبطل هذا الرمز الآن" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تسجيل يدوي" })).toBeInTheDocument();
  });

  it("★ a presenter who is not staff is not offered marking by hand (REQ-CHK-008)", async () => {
    role = "member";
    await show(view());
    expect(screen.getByRole("button", { name: "أبطل هذا الرمز الآن" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تسجيل يدوي" })).toBeNull();
  });

  it("a refused mark opens the sheet with the refusal and what was typed", async () => {
    await show(view(), { manualError: "reason_required", memberId: "m1", reason: "" });
    const dialog = screen.getByRole("dialog", { name: "تسجيل حضور يدوي" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("يجب إدخال سبب");
    expect(dialog.querySelector('input[type="hidden"][name="memberId"]')).toHaveValue("m1");
  });

  it("the footnote says what revoking does", async () => {
    await show(view());
    expect(screen.getByText(/الإبطال يُصدر رمزًا جديدًا فورًا/)).toBeInTheDocument();
  });
});

describe("outside the window (REQ-CHK-004, bug (d))", () => {
  it("before the start: the phase's sentence, no code, no projection, the switch still there (DEC-209 D3)", async () => {
    await show(view({ code: null, phase: "open", rotatesAt: null }));
    expect(screen.getByRole("status")).toHaveTextContent("لم تبدأ الجلسة بعد");
    expect(document.querySelector("p[dir='ltr']")).toBeNull();
    expect(screen.queryByRole("button", { name: "اعرض على الشاشة" })).toBeNull();
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("ended: the ended sentence, no switch, no revoke", async () => {
    await show(view({ code: null, phase: "ended", rotatesAt: null, consoleActive: false }));
    expect(screen.getByRole("status")).toHaveTextContent("انتهت الجلسة");
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: "أبطل هذا الرمز الآن" })).toBeNull();
  });
});
