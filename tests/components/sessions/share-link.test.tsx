// «شارك» on the event page shares the PUBLIC card's URL.
//
// The one thing worth a test here is the thing a reviewer cannot see by
// looking: WHICH url leaves the page. Sharing the event page's own address
// would paste a members-only link that previews as the sign-in screen — the
// exact failure the owner asked us to fix on 2026-09-15 — and the mistake
// would look identical in the UI.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareLink } from "@/components/sessions/share-link";
import { publicCardPath } from "@/components/sessions/public-card-metadata";
import { ToastProvider } from "@/components/ui/toast";

const ID = "11111111-2222-3333-4444-555555555555";
const URL = `https://kareem.pp.sa${publicCardPath("ar", ID)}`;

const view = (variant?: "button" | "icon") =>
  render(
    <ToastProvider closeLabel="إغلاق">
      <p id="share-hint">رابط عام</p>
      <ShareLink url={URL} title="جلسة" label="شارك" copiedLabel="نُسخ الرابط" hint="رابط عام" failedLabel="تعذّر نسخ الرابط" variant={variant} hintId="share-hint" />
    </ToastProvider>,
  );

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "share");
});

describe("the share affordance", () => {
  it("copies the public card's url, never the event page's, and says so", async () => {
    // setup() installs its own clipboard stub behind a getter-only property,
    // so the spy goes ON that stub rather than replacing it.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");

    view();
    await user.click(screen.getByRole("button", { name: "شارك" }));

    expect(writeText).toHaveBeenCalledWith(URL);
    expect(writeText.mock.calls[0][0]).not.toContain("/app/sessions/");
    expect(await screen.findByText("نُسخ الرابط")).toBeTruthy();
  });

  it("uses the device's share sheet when there is one, with the same public url", async () => {
    const user = userEvent.setup();
    const shareSpy = vi.fn(async () => {});
    Object.defineProperty(navigator, "share", { value: shareSpy, configurable: true });
    const writeText = vi.spyOn(navigator.clipboard, "writeText");

    view("icon");
    await user.click(screen.getByRole("button", { name: "شارك" }));

    expect(shareSpy).toHaveBeenCalledWith({ url: URL, title: "جلسة" });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("★ a refused clipboard is not a dead button — the url arrives in a toast, bidi-isolated", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));

    view();
    await user.click(screen.getByRole("button", { name: "شارك" }));

    expect(await screen.findByText("تعذّر نسخ الرابط")).toBeTruthy();
    expect(screen.getByText(`⁦${URL}⁩`)).toBeTruthy();
  });

  it("says what the recipient will see before it is shared, not after", () => {
    view();
    expect(screen.getByRole("button", { name: "شارك" })).toHaveAccessibleDescription("رابط عام");
  });
});
