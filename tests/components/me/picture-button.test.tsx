// SCR-021's way in — REQ-PRF-016, AVA-04, DEC-281 §6: the standing's picture opens «صورتك»; in «عدّل ملفك» it carries
// the camera badge.
import { NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import profileAr from "@/messages/ar/profile.json";
import uiAr from "@/messages/ar/ui.json";
import avatarsAr from "@/messages/ar/avatars.json";
import type { PictureSheetData } from "@/components/avatar-picker/types";

const refresh = vi.fn();
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh }) }));

const { PictureButton } = await import("@/components/avatar-picker/picture-button");

const SHEET: PictureSheetData = { href: "/avatars/characters/director.svg", key: "characters/director", source: null, googleAvailable: false };
const MEMBER = { memberId: "11111111-1111-1111-1111-111111111111", displayName: "ريم", teamColor: null };

function renderButton(badge: boolean) {
  return render(
    <NextIntlClientProvider locale="ar" messages={{ ...profileAr, ...uiAr, ...avatarsAr }}>
      <PictureButton sheet={SHEET} member={MEMBER} badge={badge} save={vi.fn()} read={vi.fn()}>
        <span data-testid="avatar" />
      </PictureButton>
    </NextIntlClientProvider>,
  );
}

describe("the way into «صورتك»", () => {
  it("read mode: a button named «صورتك» around the avatar, nothing drawn on it", () => {
    const { container } = renderButton(false);
    const button = screen.getByRole("button", { name: "صورتك" });
    expect(button).toContainElement(screen.getByTestId("avatar"));
    expect(container.querySelector('[data-slot="camera"]')).toBeNull();
  });

  it("edit mode: the camera badge, hidden from assistive technology", () => {
    const { container } = renderButton(true);
    const badge = container.querySelector('[data-slot="camera"]');
    expect(badge).not.toBeNull();
    expect(badge).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "صورتك" })).toContainElement(badge as HTMLElement);
  });

  it("a click opens the sheet", () => {
    renderButton(false);
    fireEvent.click(screen.getByRole("button", { name: "صورتك" }));
    expect(screen.getByRole("dialog", { name: "صورتك" })).toBeInTheDocument();
  });
});
