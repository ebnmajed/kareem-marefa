// SCR-057 — leaving with unsaved changes asks: save · discard · stay (wave 28, REQ-DSG-036, STORY-DSG-019,
// DEC-258 §2.2, DEC-259 §1.3).
//
// The guard is the house's capture-phase listener (`profile-edit.tsx`) with the three exclusions measured at sync 1 —
// `/api/*` downloads, the same pathname (the scheme links keep the editor mounted), modified clicks — and the one exit
// that is not a link, the sibling-orientation form. The dialog has three answers, and «save» may fail.
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeaveDialog } from "@/components/designer/leave-dialog";
import { leaveTargetOf, LEAVES_ATTRIBUTE, useLeaveGuard } from "@/components/designer/leave-guard";
import arDesigner from "@/messages/ar/designer.json";
import arUi from "@/messages/ar/ui.json";

const HERE = "/ar/app/admin/designer/doc-1";

let anchors: HTMLElement[] = [];
function link(href: string, attrs: Record<string, string> = {}) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = href;
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  document.body.append(a);
  anchors.push(a);
  return a;
}

beforeEach(() => {
  window.history.replaceState(null, "", HERE);
});
afterEach(() => {
  for (const a of anchors) a.remove();
  anchors = [];
});

describe("which presses leave", () => {
  const click = (a: HTMLElement, init: MouseEventInit = {}) => {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
    Object.defineProperty(event, "target", { value: a });
    return leaveTargetOf(event);
  };

  it("a same-origin link to another page leaves", () => {
    expect(click(link("/ar/app/admin/templates/posters"))).toMatchObject({ kind: "href", href: "/ar/app/admin/templates/posters" });
  });

  it.each([
    ["an export download (/api/)", "/api/designer/downloads/00000000-0000-4000-8000-000000000001", {}],
    ["a scheme link (the same document, the editor stays mounted)", `${HERE}?scheme=dark`, {}],
    ["another origin", "https://example.com/x", {}],
    ["a new tab", "/ar/app", { target: "_blank" }],
    ["a download attribute", "/ar/app", { download: "" }],
  ] as const)("%s does not", (_name, href, attrs) => {
    expect(click(link(href, attrs as Record<string, string>))).toBeNull();
  });

  it("a modified or middle click does not", () => {
    const a = link("/ar/app");
    expect(click(a, { metaKey: true })).toBeNull();
    expect(click(a, { ctrlKey: true })).toBeNull();
    expect(click(a, { shiftKey: true })).toBeNull();
    expect(click(a, { button: 1 })).toBeNull();
  });
});

describe("the guard — armed only while there is something to lose", () => {
  it("while armed, a leaving link is stopped and named; disarmed, it goes", () => {
    const a = link("/ar/app/admin/templates/posters");
    const { result, rerender } = renderHook(({ armed }) => useLeaveGuard(armed), { initialProps: { armed: true } });
    const pressed = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    act(() => void a.dispatchEvent(pressed));
    expect(pressed.defaultPrevented).toBe(true);
    expect(result.current.target).toMatchObject({ kind: "href", from: a });

    act(() => result.current.stay());
    rerender({ armed: false });
    const again = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    a.addEventListener("click", (e) => e.preventDefault(), { once: true }); // jsdom would otherwise try to navigate
    act(() => void a.dispatchEvent(again));
    expect(result.current.target).toBeNull();
  });

  it("beforeunload is armed only while armed — the browser's own question, no words of ours", () => {
    const { rerender } = renderHook(({ armed }) => useLeaveGuard(armed), { initialProps: { armed: true } });
    const asked = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(asked);
    expect(asked.defaultPrevented).toBe(true);
    rerender({ armed: false });
    const free = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(free);
    expect(free.defaultPrevented).toBe(false);
  });

  it("★ the sibling-orientation form — a Server Action that leaves — is caught, and submitted on proceed", () => {
    const form = document.createElement("form");
    form.setAttribute(LEAVES_ATTRIBUTE, "");
    const button = document.createElement("button");
    button.type = "submit";
    form.append(button);
    document.body.append(form);
    const submitted = vi.fn((e: Event) => e.preventDefault());
    const { result } = renderHook(() => useLeaveGuard(true));
    form.addEventListener("submit", submitted);
    act(() => button.click());
    expect(submitted).not.toHaveBeenCalled();
    expect(result.current.target).toMatchObject({ kind: "form", form });

    act(() => result.current.proceed(() => {}));
    expect(submitted).toHaveBeenCalledTimes(1);
    form.remove();
  });

  it("proceed releases the guard: the navigation is made, and nothing asks again on the way out", () => {
    const a = link("/ar/app/admin/templates/posters");
    const navigate = vi.fn();
    const { result } = renderHook(() => useLeaveGuard(true));
    act(() => void a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));
    act(() => result.current.proceed(navigate));
    expect(navigate).toHaveBeenCalledWith("/ar/app/admin/templates/posters");
    const out = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(out);
    expect(out.defaultPrevented).toBe(false);
  });
});

describe("the dialog — a title and three answers", () => {
  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <NextIntlClientProvider locale="ar" messages={{ ...arDesigner, ...arUi }}>
      {children}
    </NextIntlClientProvider>
  );

  it("names itself, focuses «احفظ وغادر», and each answer calls its own handler", () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onStay = vi.fn();
    render(<LeaveDialog open pending={false} onSave={onSave} onDiscard={onDiscard} onStay={onStay} returnFocus={null} />, { wrapper: Wrap });
    expect(screen.getByRole("dialog", { name: "لم تُحفظ تعديلاتك" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "احفظ وغادر" }));
    fireEvent.click(screen.getByRole("button", { name: "احفظ وغادر" }));
    fireEvent.click(screen.getByRole("button", { name: "تجاهلها وغادر" }));
    fireEvent.click(screen.getByRole("button", { name: "ابقَ" }));
    expect([onSave.mock.calls.length, onDiscard.mock.calls.length, onStay.mock.calls.length]).toEqual([1, 1, 1]);
  });

  it("while «احفظ وغادر» is in flight, nothing else can be answered", () => {
    const onDiscard = vi.fn();
    const onStay = vi.fn();
    render(<LeaveDialog open pending onSave={() => {}} onDiscard={onDiscard} onStay={onStay} returnFocus={null} />, { wrapper: Wrap });
    expect((screen.getByRole("button", { name: "تجاهلها وغادر" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "ابقَ" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onStay).not.toHaveBeenCalled();
  });

  it("declares no animation of its own (REQ-UIX-053)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/components/designer/leave-dialog.tsx", "utf8").replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/animate-|transition|duration-\d|motion-(safe|reduce):/);
  });
});
