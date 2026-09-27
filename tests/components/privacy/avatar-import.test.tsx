// «نستخدم صورتك من Google؟» — the prompt and /app/me/privacy's section
// (REQ-PRF-008, REQ-PRF-009; DEC-099, DEC-182). The DAL is mocked; the copy is
// the real Arabic.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/privacy.json";
import type { MyAvatar } from "@/lib/dal/avatars";

vi.mock("@/lib/dal/avatars", () => ({ getMyAvatar: vi.fn() }));
vi.mock("@/lib/dal/members", () => ({ getMe: vi.fn(async () => ({ id: "22222222-2222-4222-8222-222222222222", displayName: "ريم العتيبي" })) }));
vi.mock("@/app/[locale]/app/me/privacy/actions", () => ({ setAvatarImportAction: vi.fn(async () => ({ error: null, ok: true })) }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "privacy.avatar.prompt" }),
}));

const { getMyAvatar } = await import("@/lib/dal/avatars");
const { AvatarImportPrompt } = await import("@/components/privacy/avatar-import-prompt");
const { AvatarSection } = await import("@/components/privacy/avatar-section");

const HREF = "/api/avatars/22222222-2222-4222-8222-222222222222?v=1790000000000&s=192";

async function show(element: Promise<React.ReactElement | null>) {
  const el = await element;
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      {el}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => vi.mocked(getMyAvatar).mockReset());

describe("AvatarImportPrompt", () => {
  it("asks once — the question and its two answers — while unanswered with a source", async () => {
    vi.mocked(getMyAvatar).mockResolvedValue({ answer: null, hasSource: true, href: null } satisfies MyAvatar);
    await show(AvatarImportPrompt({ locale: "ar" }));
    expect(screen.getByRole("heading", { name: "نستخدم صورتك من Google؟", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "نعم، انسخ صورتي" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "لا، أبقِ الحرف الأول" })).toBeInTheDocument();
  });

  it("★ never previews the Google photo — the prompt draws no image at all (DEC-099)", async () => {
    vi.mocked(getMyAvatar).mockResolvedValue({ answer: null, hasSource: true, href: null });
    const { container } = await show(AvatarImportPrompt({ locale: "ar" }));
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("googleusercontent");
  });

  it.each([
    ["answered yes", { answer: "accepted", hasSource: true, href: null }],
    ["answered no", { answer: "declined", hasSource: true, href: null }],
    ["no source to copy", { answer: null, hasSource: false, href: null }],
  ] as const)("renders nothing once %s", async (_label, mine) => {
    vi.mocked(getMyAvatar).mockResolvedValue(mine);
    const { container } = await show(AvatarImportPrompt({ locale: "ar" }));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AvatarSection — /app/me/privacy", () => {
  it("a copy: our picture from our route, and «أزل صورتي»", async () => {
    vi.mocked(getMyAvatar).mockResolvedValue({ answer: "accepted", hasSource: true, href: HREF });
    const { container } = await show(AvatarSection({ locale: "ar" }));
    expect(container.querySelector("img")?.getAttribute("src")).toBe(HREF);
    expect(screen.getByRole("button", { name: "أزل صورتي" })).toBeInTheDocument();
    expect(screen.getByText("تظهر نسختنا من صورتك في Google بجانب اسمك.")).toBeInTheDocument();
  });

  it("yes but no copy yet: the initial and «أعد المحاولة»", async () => {
    vi.mocked(getMyAvatar).mockResolvedValue({ answer: "accepted", hasSource: true, href: null });
    const { container } = await show(AvatarSection({ locale: "ar" }));
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("ر")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "أعد المحاولة" })).toBeInTheDocument();
  });

  it("no, or unanswered: the initial and «استخدم صورتي من Google»", async () => {
    vi.mocked(getMyAvatar).mockResolvedValue({ answer: "declined", hasSource: true, href: null });
    await show(AvatarSection({ locale: "ar" }));
    expect(screen.getByRole("button", { name: "استخدم صورتي من Google" })).toBeInTheDocument();
  });

  it("nothing to copy: a sentence and no button", async () => {
    vi.mocked(getMyAvatar).mockResolvedValue({ answer: null, hasSource: false, href: null });
    await show(AvatarSection({ locale: "ar" }));
    expect(screen.getByText("لا توجد صورة في حساب Google لننسخها.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("adds no status region — privacy.spec.ts finds the page's one by role", async () => {
    vi.mocked(getMyAvatar).mockResolvedValue({ answer: "accepted", hasSource: true, href: HREF });
    await show(AvatarSection({ locale: "ar" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
