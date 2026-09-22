// «تنزيل الملصق» — REQ-DSG-027, read with DEC-176 and DEC-178. Real
// ar/sessions.json and ar/designer.json; `designer`'s DTO mocked.
//
// A NEW file (wave-13 rule 7).
import { render, screen, within } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import sessions from "@/messages/ar/sessions.json";
import designer from "@/messages/ar/designer.json";
import type { PosterDownload, SessionPosterDownloads } from "@/lib/dal/posters";

const messages = { ...sessions, ...designer };
const SESSION = "00000000-0000-4000-8000-0000000000cc";
const state: { dto: SessionPosterDownloads | null; query: string } = { dto: null, query: "" };

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as never }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useSearchParams: () => new URLSearchParams(state.query),
}));
vi.mock("@/lib/dal/posters", () => ({ getSessionPosterDownloads: async () => state.dto }));

const { SessionDownload } = await import("@/components/sessions/session-download");

const ready = (preset: PosterDownload["preset"], format: PosterDownload["format"], byteSize: number, id: string, w = 1080, h = 1350): PosterDownload => ({
  preset,
  format,
  widthPx: w,
  heightPx: h,
  state: "ready",
  byteSize,
  href: `/api/designer/downloads/${id}`,
});
const pending = (preset: PosterDownload["preset"], format: PosterDownload["format"]): PosterDownload => ({
  preset,
  format,
  widthPx: 1080,
  heightPx: 1350,
  state: "pending",
  byteSize: null,
  href: null,
});

function dto(primary: PosterDownload, others: PosterDownload[] = []): SessionPosterDownloads {
  return { sessionId: SESSION, primary, others, ready: 0, total: others.length + 1, updating: false };
}

async function mount(placement: "event" | "hub" = "event") {
  const element = await SessionDownload({ sessionId: SESSION, locale: "ar", placement });
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  state.query = "";
  state.dto = dto(ready("master", "png", 1_234_000, "a1"), [ready("square", "png", 820_000, "a2", 1080, 1080), pending("story", "png"), ready("a4", "pdf", 2_400_000, "a3")]);
});

describe("«تنزيل الملصق»", () => {
  it("one primary link, whose href is exactly the DTO's, with the format, the ratio and a human size", async () => {
    await mount();
    const primary = screen.getByRole("link", { name: "تنزيل الملصق" });
    expect(primary).toHaveAttribute("href", "/api/designer/downloads/a1");
    // ★ Western digits, a human unit, the ratio reduced (DEC-124).
    expect(primary.parentElement!.textContent).toContain("PNG · 4:5 · 1.2\u00A0ميغابايت");
    expect(screen.getAllByRole("link", { name: "تنزيل الملصق" })).toHaveLength(1);
  });

  it("the rest sit behind a disclosure with a counted summary, and a pending row is never a link", async () => {
    const { container } = await mount();
    const details = container.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(details.querySelector("summary")).toHaveTextContent("3 صيغ أخرى");
    const rows = within(details).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(details).getByRole("link", { name: "تنزيل مربّع بصيغة PNG" })).toHaveAttribute("href", "/api/designer/downloads/a2");
    expect(within(details).getByRole("link", { name: "تنزيل طباعة A4 بصيغة PDF" })).toHaveAttribute("href", "/api/designer/downloads/a3");
    expect(within(rows[1]).queryByRole("link")).toBeNull();
    expect(rows[1]).toHaveTextContent("قيد الإعداد");
    expect(rows[0].textContent).toContain("820\u00A0كيلوبايت");
  });

  it("the summary's count uses the Arabic plural forms", async () => {
    state.dto = dto(ready("master", "png", 1000, "a1"), [ready("square", "png", 1000, "a2")]);
    const one = await mount();
    expect(one.container.querySelector("summary")).toHaveTextContent("صيغة أخرى");
    one.unmount();
    state.dto = dto(ready("master", "png", 1000, "a1"), [ready("square", "png", 1000, "a2"), ready("og", "png", 1000, "a3")]);
    const two = await mount();
    expect(two.container.querySelector("summary")).toHaveTextContent("صيغتان أخريان");
  });

  it("no disclosure when there is nothing else", async () => {
    state.dto = dto(ready("master", "png", 1000, "a1"));
    const { container } = await mount();
    expect(container.querySelector("details")).toBeNull();
  });

  it("a pending primary reads as pending, and is not a link", async () => {
    state.dto = dto(pending("master", "png"), [ready("square", "png", 1000, "a2")]);
    await mount();
    expect(screen.queryByRole("link", { name: "تنزيل الملصق" })).toBeNull();
    expect(screen.getByText("الملصق قيد الإعداد")).toBeInTheDocument();
  });

  it("a failed primary says so, and only the hub says what to do about it", async () => {
    state.dto = dto({ ...pending("master", "png"), state: "failed" });
    const event = await mount("event");
    expect(screen.getByText("تعذّر إعداد الملصق")).toBeInTheDocument();
    expect(screen.queryByText("اطلب التصدير من جديد من الاستوديو.")).toBeNull();
    event.unmount();
    await mount("hub");
    expect(screen.getByText("اطلب التصدير من جديد من الاستوديو.")).toBeInTheDocument();
  });

  it("renders nothing when the DTO is null", async () => {
    state.dto = null;
    const { container } = await mount();
    expect(container).toBeEmptyDOMElement();
  });

  it("says a download failed when the route sent the viewer back with ?download=failed", async () => {
    state.query = "download=failed";
    await mount();
    expect(screen.getByRole("alert")).toHaveTextContent("تعذّر التنزيل. حاول مرة أخرى.");
  });
});
