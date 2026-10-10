// The sheet «صورتك» — REQ-PRF-016 … 019, AVA-04 … 12, DEC-280, DEC-281. Its three states, staging, the library's
// names, and the crop's refusals.
import { NextIntlClientProvider } from "next-intl";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import profileAr from "@/messages/ar/profile.json";
import uiAr from "@/messages/ar/ui.json";
import avatarsAr from "@/messages/ar/avatars.json";
import { AVATAR_KEYS } from "@/lib/avatar-library";
import type { PictureChoice, PictureSaveResult, PictureSheetData } from "@/components/avatar-picker/types";

const uploadPicture = vi.fn();
vi.mock("@/components/avatar-picker/upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/avatar-picker/upload")>()),
  uploadPicture: (...args: unknown[]) => uploadPicture(...args),
}));
vi.mock("@/components/avatar-picker/encode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/avatar-picker/encode")>()),
  encodeSquare: async () => new Blob([new Uint8Array(100)], { type: "image/jpeg" }),
}));

const { PictureSheet } = await import("@/components/avatar-picker/picture-sheet");

const messages = { ...profileAr, ...uiAr, ...avatarsAr };
const MEMBER = { memberId: "11111111-1111-1111-1111-111111111111", displayName: "ريم", teamColor: "#ff9a2e" };
const LIBRARY: PictureSheetData = { href: "/avatars/characters/director.svg", key: "characters/director", source: null, googleAvailable: true };
const PHOTO: PictureSheetData = { href: "/api/avatars/11111111-1111-1111-1111-111111111111?v=5&s=192", key: "characters/director", source: "upload", googleAvailable: true };
const NO_GOOGLE: PictureSheetData = { ...LIBRARY, googleAvailable: false };

const save = vi.fn<(choice: PictureChoice) => Promise<PictureSaveResult>>();
const onSaved = vi.fn();
const onOpenChange = vi.fn();

function renderSheet(sheet: PictureSheetData = LIBRARY) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <PictureSheet open onOpenChange={onOpenChange} sheet={sheet} member={MEMBER} save={save} onSaved={onSaved} />
    </NextIntlClientProvider>,
  );
}

const dialog = () => screen.getByRole("dialog", { name: "صورتك" });
const avatarButton = (name: string) => within(dialog()).getByRole("button", { name });
const pressed = () => within(dialog()).getAllByRole("button", { pressed: true }).map((b) => b.getAttribute("aria-label") ?? b.textContent);

beforeEach(() => {
  save.mockReset();
  onSaved.mockReset();
  onOpenChange.mockReset();
  uploadPicture.mockReset();
});

describe("the three states (AVA-05) — what cannot apply is absent", () => {
  it("A — a library avatar current: the held key outlined, no «أزل الصورة»", () => {
    renderSheet(LIBRARY);
    expect(within(dialog()).queryByRole("button", { name: "أزل الصورة" })).toBeNull();
    expect(avatarButton("المخرج")).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog()).getByRole("button", { name: "من Google" })).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: "ارفع صورة" })).toBeInTheDocument();
  });

  it("B — a photo current: «أزل الصورة» shown, nothing outlined", () => {
    renderSheet(PHOTO);
    expect(within(dialog()).getByRole("button", { name: "أزل الصورة" })).toBeInTheDocument();
    expect(avatarButton("المخرج")).toHaveAttribute("aria-pressed", "false");
    // Only the set chip is pressed — no avatar.
    expect(pressed()).toEqual(["شخصيات"]);
  });

  it("C — Google gave nothing: «من Google» absent, never disabled", () => {
    renderSheet(NO_GOOGLE);
    expect(within(dialog()).queryByRole("button", { name: "من Google" })).toBeNull();
    expect(within(dialog()).queryAllByRole("button").filter((b) => (b as HTMLButtonElement).disabled)).toEqual([]);
  });
});

describe("the library (AVA-10, AVA-11)", () => {
  it("names every avatar by its library name and draws no text on one", () => {
    renderSheet();
    const names = (avatarsAr as { avatars: { names: Record<string, Record<string, string>> } }).avatars.names;
    for (const set of ["characters", "objects"] as const) {
      fireEvent.click(within(dialog()).getByRole("button", { name: set === "characters" ? "شخصيات" : "أشياء" }));
      const keys = AVATAR_KEYS.filter((k) => k.startsWith(`${set}/`));
      const list = within(dialog()).getByRole("list", { name: "الصور الرمزية" });
      const buttons = within(list).getAllByRole("button");
      expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(keys.map((k) => names[set][k.split("/")[1]]));
      for (const b of buttons) expect(b.textContent).toBe("");
    }
  });

  it("the chips switch the set the one grid shows", () => {
    renderSheet();
    expect(within(dialog()).getByRole("button", { name: "شخصيات" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(dialog()).getByRole("button", { name: "أشياء" }));
    expect(within(dialog()).getByRole("button", { name: "أشياء" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog()).getByRole("button", { name: "الكلاكيت" })).toBeInTheDocument();
    expect(within(dialog()).queryByRole("button", { name: "المخرج" })).toBeNull();
  });
});

describe("staging — nothing changes until «حفظ» (AVA-04)", () => {
  it("a tap outlines the avatar and shows it in the ring, and writes nothing", () => {
    renderSheet();
    fireEvent.click(within(dialog()).getByRole("button", { name: "أشياء" }));
    fireEvent.click(avatarButton("الكلاكيت"));
    expect(avatarButton("الكلاكيت")).toHaveAttribute("aria-pressed", "true");
    expect(dialog().querySelector('img[src="/avatars/objects/clapper.svg"]')).not.toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it("«حفظ» commits the staged key once, then closes", async () => {
    save.mockResolvedValue({ status: "ok", sheet: { ...LIBRARY, key: "objects/clapper", href: "/avatars/objects/clapper.svg" } });
    renderSheet();
    fireEvent.click(within(dialog()).getByRole("button", { name: "أشياء" }));
    fireEvent.click(avatarButton("الكلاكيت"));
    fireEvent.click(within(dialog()).getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("library"));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ kind: "library", key: "objects/clapper" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closing without «حفظ» writes nothing", () => {
    renderSheet();
    fireEvent.click(avatarButton("الممثل"));
    fireEvent.keyDown(dialog(), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("«حفظ» with nothing staged closes without a write", () => {
    renderSheet();
    fireEvent.click(within(dialog()).getByRole("button", { name: "حفظ" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("«أزل الصورة» stages the removal — the held avatar in the ring — and «حفظ» sends it", async () => {
    save.mockResolvedValue({ status: "ok", sheet: LIBRARY });
    renderSheet(PHOTO);
    fireEvent.click(within(dialog()).getByRole("button", { name: "أزل الصورة" }));
    expect(within(dialog()).queryByRole("button", { name: "أزل الصورة" })).toBeNull();
    expect(avatarButton("المخرج")).toHaveAttribute("aria-pressed", "true");
    expect(dialog().querySelector('img[src="/avatars/characters/director.svg"]')).not.toBeNull();
    fireEvent.click(within(dialog()).getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ kind: "remove" }));
  });

  it("★ «من Google» is staged, pressed, and the ring does NOT change (DEC-099, DEC-281 §7)", async () => {
    save.mockResolvedValue({ status: "ok", sheet: LIBRARY });
    renderSheet(LIBRARY);
    const before = dialog().querySelector("img")?.getAttribute("src");
    fireEvent.click(within(dialog()).getByRole("button", { name: "من Google" }));
    expect(within(dialog()).getByRole("button", { name: "من Google" })).toHaveAttribute("aria-pressed", "true");
    expect(dialog().querySelector("img")?.getAttribute("src")).toBe(before);
    expect(Array.from(dialog().querySelectorAll("img")).some((i) => /googleusercontent|^https?:/.test(i.getAttribute("src") ?? ""))).toBe(false);
    fireEvent.click(within(dialog()).getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ kind: "google" }));
  });

  it("a failed save keeps the sheet and the stage, with «تعذّر الحفظ»", async () => {
    save.mockResolvedValue({ status: "failed" });
    renderSheet();
    fireEvent.click(avatarButton("الممثل"));
    fireEvent.click(within(dialog()).getByRole("button", { name: "حفظ" }));
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("تعذّر الحفظ");
    expect(avatarButton("الممثل")).toHaveAttribute("aria-pressed", "true");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("the crop step and its refusals (AVA-06, AVA-07)", () => {
  const fileInput = () => dialog().querySelector('input[type="file"]') as HTMLInputElement;
  const choose = async (file: File) => {
    await act(async () => {
      fireEvent.change(fileInput(), { target: { files: [file] } });
    });
  };
  const png = (bytes = 10) => new File([new Uint8Array(bytes)], "me.png", { type: "image/png" });

  beforeEach(() => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })));
    HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  it("accepts PNG and JPEG only, so iOS converts HEIC itself", () => {
    renderSheet();
    expect(fileInput()).toHaveAttribute("accept", "image/png,image/jpeg");
  });

  it("refuses a file over 20 MB with a word, and the crop does not open", async () => {
    renderSheet();
    const big = png();
    Object.defineProperty(big, "size", { value: 21 * 1024 * 1024 });
    await choose(big);
    expect(within(dialog()).getByRole("alert")).toHaveTextContent("أكبر من 20 م.ب");
    expect(within(dialog()).queryByRole("slider")).toBeNull();
  });

  it("refuses another type, and a file that will not decode, with «PNG أو JPG فقط»", async () => {
    renderSheet();
    await choose(new File([new Uint8Array(10)], "me.gif", { type: "image/gif" }));
    expect(within(dialog()).getByRole("alert")).toHaveTextContent("PNG أو JPG فقط");
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error("bad"));
    await choose(png());
    expect(within(dialog()).getByRole("alert")).toHaveTextContent("PNG أو JPG فقط");
    expect(within(dialog()).queryByRole("slider")).toBeNull();
  });

  it("opens the crop: the image, a named zoom slider, «إلغاء», «حفظ»", async () => {
    renderSheet();
    await choose(png());
    expect(within(dialog()).getByRole("slider", { name: "تكبير" })).toBeInTheDocument();
    expect(within(dialog()).getByRole("group", { name: "الصورة" })).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: "إلغاء" })).toBeInTheDocument();
  });

  it("«إلغاء» returns to the sheet with what was staged before", async () => {
    renderSheet();
    fireEvent.click(avatarButton("الممثل"));
    await choose(png());
    fireEvent.click(within(dialog()).getByRole("button", { name: "إلغاء" }));
    expect(avatarButton("الممثل")).toHaveAttribute("aria-pressed", "true");
    expect(uploadPicture).not.toHaveBeenCalled();
  });

  it("a failed upload says «تعذّر الرفع», and «أعد المحاولة» sends it again", async () => {
    uploadPicture.mockResolvedValueOnce({ state: "failed" }).mockResolvedValueOnce({ state: "done", href: null });
    renderSheet();
    await choose(png());
    fireEvent.click(within(dialog()).getByRole("button", { name: "حفظ" }));
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("تعذّر الرفع");
    fireEvent.click(within(dialog()).getByRole("button", { name: "أعد المحاولة" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("upload"));
    expect(uploadPicture).toHaveBeenCalledTimes(2);
    expect(save).not.toHaveBeenCalled();
  });

  it("the server's refusal (an SVG renamed .png) says «PNG أو JPG فقط» on the crop", async () => {
    uploadPicture.mockResolvedValueOnce({ state: "refused" });
    renderSheet();
    await choose(png());
    fireEvent.click(within(dialog()).getByRole("button", { name: "حفظ" }));
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("PNG أو JPG فقط");
    expect(within(dialog()).queryByRole("button", { name: "أعد المحاولة" })).toBeNull();
  });
});
