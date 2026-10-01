// SCR-024 rebuilt (wave 20) — REQ-UIX-074, REQ-DSC-006, DEC-218 §4.4. The optimistic removal with its undo, and
// ★ the proof the grant asked for: `BookmarkButton` with NO `BookmarkChangeProvider` behaves exactly as before.
// Real ar messages; only the "use server" actions module is mocked.
import { NextIntlClientProvider } from "next-intl";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import searchAr from "@/messages/ar/search.json";
import profileAr from "@/messages/ar/profile.json";
import { ToastProvider } from "@/components/ui/toast";

const toggleBookmarkAction = vi.fn();
vi.mock("@/components/search/actions", () => ({ toggleBookmarkAction }));

const { BookmarkButton } = await import("@/components/search/bookmark-button");
const { BookmarkList } = await import("@/components/me/bookmark-list");

const messages = { ...searchAr, ...profileAr };
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const SAVE = searchAr.search.bookmarkButton.icon;

function Row({ id, title }: { id: string; title: string }) {
  return (
    <article>
      <h3>{title}</h3>
      <BookmarkButton locale="ar" sessionId={id} initialBookmarked />
    </article>
  );
}

function renderWith(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">{node}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

function renderList() {
  return renderWith(
    <BookmarkList
      locale="ar"
      empty={<p>{profileAr.profile.bookmarks.empty}</p>}
      items={[
        { id: A, row: <Row id={A} title="جلسة أولى" /> },
        { id: B, row: <Row id={B} title="جلسة ثانية" /> },
      ]}
    />,
  );
}

beforeEach(() => toggleBookmarkAction.mockReset());

describe("BookmarkButton without a provider — unchanged (DEC-218 §4.4)", () => {
  it("presses, flips aria-pressed, calls the action, and keeps its name", async () => {
    toggleBookmarkAction.mockResolvedValue({ error: null });
    renderWith(<BookmarkButton locale="ar" sessionId={A} initialBookmarked={false} />);
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    expect(screen.getByRole("button", { name: SAVE })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(toggleBookmarkAction).toHaveBeenCalledWith("ar", A, true));
  });

  it("rolls back on failure and says so in an error toast", async () => {
    toggleBookmarkAction.mockResolvedValue({ error: "unknown_error" });
    renderWith(<BookmarkButton locale="ar" sessionId={A} initialBookmarked />);
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    await waitFor(() => expect(screen.getByRole("button", { name: SAVE })).toHaveAttribute("aria-pressed", "true"));
    expect(await screen.findByText(searchAr.search.bookmarkButton.failed)).toBeInTheDocument();
  });
});

describe("BookmarkList — SCR-024's removal", () => {
  it("★ drops the row at once and offers «تراجع»", async () => {
    let resolve: (v: { error: string | null }) => void = () => {};
    toggleBookmarkAction.mockReturnValue(new Promise((r) => (resolve = r)));
    renderList();
    fireEvent.click(screen.getAllByRole("button", { name: SAVE })[0]);
    // Gone before the action answers — optimistic.
    expect(screen.queryByRole("heading", { name: "جلسة أولى" })).toBeNull();
    expect(screen.getByRole("heading", { name: "جلسة ثانية" })).toBeInTheDocument();
    expect(await screen.findByText(profileAr.profile.bookmarks.removed)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: profileAr.profile.bookmarks.undo })).toBeInTheDocument();
    await act(async () => resolve({ error: null }));
    expect(toggleBookmarkAction).toHaveBeenCalledWith("ar", A, false);
  });

  it("★ «تراجع» puts the row back, pressed, and saves it again", async () => {
    toggleBookmarkAction.mockResolvedValue({ error: null });
    renderList();
    fireEvent.click(screen.getAllByRole("button", { name: SAVE })[0]);
    await waitFor(() => expect(toggleBookmarkAction).toHaveBeenCalledWith("ar", A, false));
    fireEvent.click(await screen.findByRole("button", { name: profileAr.profile.bookmarks.undo }));
    expect(await screen.findByRole("heading", { name: "جلسة أولى" })).toBeInTheDocument();
    await waitFor(() => expect(toggleBookmarkAction).toHaveBeenLastCalledWith("ar", A, true));
    // Back where it was, and its control says it is saved.
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["جلسة أولى", "جلسة ثانية"]);
    expect(screen.getAllByRole("button", { name: SAVE })[0]).toHaveAttribute("aria-pressed", "true");
  });

  it("a failed removal brings the row back and the button says why", async () => {
    toggleBookmarkAction.mockResolvedValue({ error: "unknown_error" });
    renderList();
    fireEvent.click(screen.getAllByRole("button", { name: SAVE })[0]);
    expect(await screen.findByRole("heading", { name: "جلسة أولى" })).toBeInTheDocument();
    expect(await screen.findByText(searchAr.search.bookmarkButton.failed)).toBeInTheDocument();
  });

  it("removing the last row shows the empty state", async () => {
    toggleBookmarkAction.mockResolvedValue({ error: null });
    renderWith(<BookmarkList locale="ar" empty={<p>{profileAr.profile.bookmarks.empty}</p>} items={[{ id: A, row: <Row id={A} title="جلسة أولى" /> }]} />);
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    expect(screen.getByText(profileAr.profile.bookmarks.empty)).toBeInTheDocument();
  });

  it("is axe-clean", async () => {
    const { container } = renderList();
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
