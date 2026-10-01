// SCR-013's chrome around `ui/page-viewer` — REQ-UIX-065, REQ-MAT-005, REQ-MAT-011, DEC-213, DEC-214 §3.
// The real `ar/materials.json` through the provider; the server action and the router are stubbed.
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/materials.json";

const refresh = vi.fn();
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh }) }));
const requestMaterialDownload = vi.fn();
vi.mock("@/app/[locale]/app/sessions/[id]/materials/[materialId]/actions", () => ({
  requestMaterialDownload: (...a: unknown[]) => requestMaterialDownload(...a),
}));

const { ViewerScreen } = await import("@/components/viewer/viewer-screen");
type Props = Parameters<typeof ViewerScreen>[0];

const V = ar.materials.viewer;
const pages = [1, 2, 3].map((n) => ({ pageNumber: n, imageUrl: `https://x.test/${n}.webp`, thumbnailUrl: `https://x.test/t${n}.webp`, width: 1600, height: 900 }));

const base: Props = {
  locale: "ar",
  sessionId: "s-1",
  materialId: "m-1",
  title: "الشرائح — الأرقام التي تكذب",
  kindLabel: "PDF",
  presenters: [
    { displayName: "محمد الدوسري", companyName: "جذر" },
    { displayName: "سارة القحطاني", companyName: "مواهب" },
  ],
  pages,
  renderStatus: "ready",
  canDownload: false,
  isAdmin: false,
  canReplace: false,
  substitutionFamily: null,
};

function renderScreen(over: Partial<Props> = {}) {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <ViewerScreen {...base} {...over} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  refresh.mockReset();
  requestMaterialDownload.mockReset();
});

describe("ViewerScreen — the chrome", () => {
  it("the title is the one h1, and the phone's second line is «صفحة N من M» (the indicator the e2e pins)", () => {
    renderScreen();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(base.title);
    expect(screen.getByTestId("page-indicator")).toHaveTextContent("صفحة 1 من 3");
  });

  it("★ «الصفحة التالية» moves the screen's page from 1 to 2 — the bar and the footer follow", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole("button", { name: V.next }));
    expect(screen.getByTestId("page-indicator")).toHaveTextContent("صفحة 2 من 3");
    await user.click(screen.getByRole("button", { name: V.previous }));
    expect(screen.getByTestId("page-indicator")).toHaveTextContent("صفحة 1 من 3");
  });

  it("the close control leads back to the session", () => {
    renderScreen();
    const close = screen.getByRole("link", { name: V.close });
    expect(close.getAttribute("href")).toMatch(/\/app\/sessions\/s-1$/);
  });

  it("★ every presenter, each with their company in <bdi>, then the page count and the kind (contract 8, N8)", () => {
    const { container } = renderScreen();
    const bdis = [...container.querySelectorAll("bdi")].map((b) => b.textContent);
    for (const part of ["محمد الدوسري", "جذر", "سارة القحطاني", "مواهب"]) expect(bdis).toContain(part);
    expect(container.textContent).toContain("3 صفحات");
    expect(container.textContent).toContain("PDF");
  });

  it("the keys legend names ← as next in Arabic", () => {
    renderScreen();
    const keys = screen.getByRole("list", { name: V.keysLabel });
    expect(within(keys).getAllByRole("listitem")[0]).toHaveTextContent(`←${V.keys.next}`);
    expect(within(keys).getAllByRole("listitem")[1]).toHaveTextContent(`→${V.keys.previous}`);
  });
});

describe("ViewerScreen — download (REQ-MAT-005, DEC-214 §3 N2, N3)", () => {
  it("★ a viewer who may not fetch the file gets no control at all, and nothing is asked", () => {
    renderScreen({ canDownload: false });
    expect(screen.queryByRole("button", { name: V.download })).toBeNull();
    expect(screen.queryByRole("button", { name: V.downloadShort })).toBeNull();
    expect(requestMaterialDownload).not.toHaveBeenCalled();
  });

  it("a member who may download gets the control, and is NOT told the download is audited", () => {
    renderScreen({ canDownload: true });
    expect(screen.getByRole("button", { name: V.download })).toBeInTheDocument();
    expect(screen.queryByText(V.downloadAudited)).toBeNull();
  });

  it("★ an admin is told — beside the control from lg, and as the phone control's description", () => {
    renderScreen({ canDownload: true, isAdmin: true });
    const note = screen.getByText(V.downloadAudited);
    expect(screen.getByRole("button", { name: V.download })).toHaveAttribute("aria-describedby", note.id);
  });

  it("the URL is asked for on click and followed; a refusal follows nothing", async () => {
    const user = userEvent.setup();
    requestMaterialDownload.mockResolvedValueOnce({ url: null });
    renderScreen({ canDownload: true });
    await user.click(screen.getByRole("button", { name: V.download }));
    expect(requestMaterialDownload).toHaveBeenCalledWith("ar", "m-1");
  });
});

describe("ViewerScreen — the phone's chrome toggles (DEC-213 §5.87)", () => {
  function stage(container: HTMLElement) {
    return container.querySelector(`img[alt^='${base.title}']`)!.parentElement!;
  }
  const tap = (el: Element) => {
    fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(el, { pointerId: 1, button: 0, clientX: 101, clientY: 101 });
  };

  it("a tap hides the bars; another brings them back; nothing is ever aria-hidden", () => {
    const { container } = renderScreen();
    const header = container.querySelector("header")!;
    tap(stage(container));
    expect(header.className).toContain("max-lg:opacity-0");
    expect(header).not.toHaveAttribute("aria-hidden");
    expect(header).not.toHaveAttribute("inert");
    tap(stage(container));
    expect(header.className).not.toContain("max-lg:opacity-0");
  });

  it("★ hidden chrome comes back on any key and on any focus", async () => {
    const user = userEvent.setup();
    const { container } = renderScreen();
    const header = container.querySelector("header")!;
    tap(stage(container));
    await user.keyboard("x");
    expect(header.className).not.toContain("max-lg:opacity-0");
    tap(stage(container));
    fireEvent.focus(screen.getByRole("link", { name: V.close }));
    expect(header.className).not.toContain("max-lg:opacity-0");
  });

  it("under reduced motion the bars appear and disappear without sliding", () => {
    const { container } = renderScreen();
    const header = container.querySelector("header")!;
    expect(header.className).toContain("motion-reduce:transition-none");
    tap(stage(container));
    expect(header.className).toContain("motion-reduce:max-lg:translate-y-0");
  });
});

describe("ViewerScreen — the states M10b.md §1 names", () => {
  it("rendering: the words and an indeterminate bar, no page count, no download", () => {
    renderScreen({ renderStatus: "rendering", pages: [], canDownload: true });
    expect(screen.getAllByText(ar.materials.list.renderStatus.rendering).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("page-indicator")).toBeNull();
  });

  it("★ failed, for a member: the plain sentence — the re-upload guidance is not theirs to act on (N4)", () => {
    renderScreen({ renderStatus: "failed", pages: [] });
    expect(screen.getByText(V.states.failedShort)).toBeInTheDocument();
    expect(screen.queryByText(V.states.failed)).toBeNull();
  });

  it("failed, for who can replace the file: the guidance; «أعد المحاولة» reloads", async () => {
    const user = userEvent.setup();
    renderScreen({ renderStatus: "failed", pages: [], canReplace: true });
    expect(screen.getByText(V.states.failed)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: V.states.retry }));
    expect(refresh).toHaveBeenCalled();
  });

  it("a non-paged material reached by its URL: the no-pages sentence", () => {
    renderScreen({ renderStatus: "not_applicable", pages: [] });
    expect(screen.getByText(V.states.noPages)).toBeInTheDocument();
  });

  it("★ the substitution notice, its family in <bdi>, only when the page hands one (presenters and staff, N9)", () => {
    const { container, unmount } = renderScreen();
    expect(container.textContent).not.toContain("غير مضمَّن");
    unmount();
    const shown = renderScreen({ substitutionFamily: "Amiri" });
    expect([...shown.container.querySelectorAll("bdi")].map((b) => b.textContent)).toContain("Amiri");
  });
});
