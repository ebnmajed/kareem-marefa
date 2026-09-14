// BookmarkButton — REQ-DSC-006. Real ar/search.json; only the "use server"
// actions module is mocked (the same reason tests/components/event/
// comment-item.test.tsx mocks its own actions module).
import { NextIntlClientProvider } from "next-intl";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/search.json";

const toggleBookmarkAction = vi.fn();
vi.mock("@/components/search/actions", () => ({ toggleBookmarkAction }));

const { BookmarkButton } = await import("@/components/search/bookmark-button");

function renderButton(initialBookmarked: boolean) {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <BookmarkButton locale="ar" sessionId="11111111-1111-1111-1111-111111111111" initialBookmarked={initialBookmarked} />
    </NextIntlClientProvider>,
  );
}

describe("BookmarkButton", () => {
  it("★ toggles optimistically from add to remove, and calls the action with bookmarked=true", async () => {
    toggleBookmarkAction.mockResolvedValue({ error: null });
    renderButton(false);
    const button = screen.getByRole("button", { name: ar.search.bookmarkButton.add });
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: ar.search.bookmarkButton.remove })).toBeInTheDocument();
    await waitFor(() => expect(toggleBookmarkAction).toHaveBeenCalledWith("ar", "11111111-1111-1111-1111-111111111111", true));
  });

  it("rolls back the optimistic toggle when the action fails", async () => {
    toggleBookmarkAction.mockResolvedValue({ error: "unknown_error" });
    renderButton(false);
    fireEvent.click(screen.getByRole("button", { name: ar.search.bookmarkButton.add }));
    await waitFor(() => expect(screen.getByRole("button", { name: ar.search.bookmarkButton.add })).toBeInTheDocument());
  });
});
