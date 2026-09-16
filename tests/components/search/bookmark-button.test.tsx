// BookmarkButton — REQ-DSC-006. Real ar/search.json; only the "use server"
// actions module is mocked (the same reason tests/components/event/
// comment-item.test.tsx mocks its own actions module).
import { NextIntlClientProvider } from "next-intl";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/search.json";

const toggleBookmarkAction = vi.fn();
vi.mock("@/components/search/actions", () => ({ toggleBookmarkAction }));

const { BookmarkButton } = await import("@/components/search/bookmark-button");

const ID = "11111111-1111-1111-1111-111111111111";

function renderButton(initialBookmarked: boolean, variant?: "icon" | "button") {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <BookmarkButton locale="ar" sessionId={ID} initialBookmarked={initialBookmarked} variant={variant} />
    </NextIntlClientProvider>,
  );
}

describe("BookmarkButton", () => {
  it("★ toggles optimistically, keeps its name, and says its state with aria-pressed", async () => {
    toggleBookmarkAction.mockResolvedValue({ error: null });
    renderButton(false);
    const button = screen.getByRole("button", { name: ar.search.bookmarkButton.icon });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    // The same control, found by the same name, now pressed.
    expect(screen.getByRole("button", { name: ar.search.bookmarkButton.icon })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(toggleBookmarkAction).toHaveBeenCalledWith("ar", ID, true));
  });

  it("rolls back the optimistic toggle when the action fails", async () => {
    toggleBookmarkAction.mockResolvedValue({ error: "unknown_error" });
    renderButton(false);
    fireEvent.click(screen.getByRole("button", { name: ar.search.bookmarkButton.icon }));
    await waitFor(() => expect(screen.getByRole("button", { name: ar.search.bookmarkButton.icon })).toHaveAttribute("aria-pressed", "false"));
  });

  it("removes a saved session with the same control", async () => {
    toggleBookmarkAction.mockResolvedValue({ error: null });
    renderButton(true);
    const button = screen.getByRole("button", { name: ar.search.bookmarkButton.icon });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    await waitFor(() => expect(toggleBookmarkAction).toHaveBeenCalledWith("ar", ID, false));
  });

  it("carries a visible label in the action card, and its name is that label (SC 2.5.3)", async () => {
    const { container } = renderButton(false, "button");
    const button = screen.getByRole("button", { name: ar.search.bookmarkButton.short });
    expect(button).toHaveAttribute("aria-pressed", "false");
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
