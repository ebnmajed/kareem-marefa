// «شارك الرابط» on the event page copies the PUBLIC card's URL.
//
// The one thing worth a test here is the thing a reviewer cannot see by
// looking: WHICH url reaches the clipboard. Copying the event page's own
// address would paste a members-only link that previews as the sign-in
// screen — the exact failure the owner asked us to fix on 2026-09-15 — and
// the mistake would look identical in the UI.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ShareLink } from "@/components/sessions/share-link";
import { publicCardPath } from "@/components/sessions/public-card-metadata";

const ID = "11111111-2222-3333-4444-555555555555";
const URL = `https://kareem.pp.sa${publicCardPath("ar", ID)}`;

const view = () => render(<ShareLink url={URL} label="شارك الرابط" copiedLabel="نُسخ الرابط" hint="رابط عام" />);

describe("the share affordance", () => {
  it("copies the public card's url, never the event page's", async () => {
    // setup() installs its own clipboard stub behind a getter-only property,
    // so the spy goes ON that stub rather than replacing it.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");

    view();
    await user.click(screen.getByRole("button", { name: "شارك الرابط" }));

    expect(writeText).toHaveBeenCalledWith(URL);
    expect(writeText.mock.calls[0][0]).not.toContain("/app/sessions/");
    expect(await screen.findByText("نُسخ الرابط")).toBeTruthy();
  });

  it("shows the url as text as well, so a refused clipboard is not a dead button", () => {
    view();
    // `navigator.clipboard` needs a secure context and a permission a phone
    // browser can refuse. The text is always there and always selectable.
    const shown = screen.getByText(URL);
    expect(shown.tagName.toLowerCase()).toBe("bdi");
    expect(shown.getAttribute("dir")).toBe("ltr");
  });

  it("says what the recipient will see before it is shared, not after", () => {
    view();
    expect(screen.getByRole("status").textContent).toBe("رابط عام");
  });
});
