// `<Avatar>` with a library avatar — wave 29, PR A (DEC-280; REQ-PRF-014, REQ-PRF-015; `m10c/Me.dc.html`).
// A library avatar sits on the ground, inset inside the ring; a photo still fills the disc; the initials stay under
// both. The accessible name is the member's, never the avatar's — the library name is the picker's alone (AVA-11).
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar, isLibrarySrc, SCOPE_TINTS, TINTS, tintIndex } from "@/components/ui/avatar";

describe("isLibrarySrc", () => {
  it("is true only for a shipped library path", () => {
    expect(isLibrarySrc("/avatars/characters/director.svg")).toBe(true);
    expect(isLibrarySrc("/avatars/objects/director-chair.svg")).toBe(true);
    for (const src of [null, undefined, "/api/avatars/x?v=1&s=96", "/avatars/../x.svg", "https://example.com/avatars/objects/reel.svg"]) {
      expect(isLibrarySrc(src)).toBe(false);
    }
  });
});

describe("Avatar — a library avatar", () => {
  it("draws the SVG inset on the ground, not on the member's tint", () => {
    const { container } = render(<Avatar memberId="m-1" displayName="ريم" src="/avatars/objects/reel.svg" size={64} teamColor="#ff9a2e" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("bg-canvas");
    expect(root.className).not.toContain(TINTS[tintIndex("m-1")]);
    expect(root.className).not.toContain(SCOPE_TINTS[tintIndex("m-1")]);
    expect(root.className).toContain("border-team");
    const img = root.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/avatars/objects/reel.svg");
    expect(img.className).toContain("inset-[7%]");
    expect(img.getAttribute("alt")).toBe("");
  });

  it("keeps the initials underneath and names the member, never the avatar", () => {
    const { container } = render(<Avatar memberId="m-1" displayName="ريم" src="/avatars/characters/director.svg" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.querySelector("bdi")).toHaveTextContent("ر");
    expect(root.getAttribute("aria-label")).toBe("ريم");
  });

  it("a photo still fills the disc on the member's tint", () => {
    const { container } = render(<Avatar memberId="m-1" displayName="ريم" src="/api/avatars/22222222-2222-4222-8222-222222222222?v=7&s=96" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain(TINTS[tintIndex("m-1")]);
    expect(root.querySelector("img")!.className).toContain("inset-0");
  });
});
