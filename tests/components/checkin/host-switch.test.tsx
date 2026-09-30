// SCR-016's switch — REQ-CHK-015, DEC-141, REQ-UIX-062. It shows the server's answer; a change
// submits the bound action and never moves the thumb on its own; without JS a submit does the same.
import { renderToString } from "react-dom/server";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HostSwitch } from "@/components/checkin/host-switch";

describe("HostSwitch", () => {
  it("is controlled by `open`, and a change asks the form to submit", () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => {});
    render(<HostSwitch open action={async () => {}} label="تسجيل الحضور مفتوح" description="يُغلق تلقائيًا 9:30 م" noScript={<button type="submit">أغلق تسجيل الحضور</button>} />);
    const toggle = screen.getByRole("switch", { name: "تسجيل الحضور مفتوح" });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(submit).toHaveBeenCalledTimes(1);
    // The server's answer, not the tap, moves it: still on until the redirect brings «closed».
    expect(toggle).toBeChecked();
    submit.mockRestore();
  });

  it("closed reads as off", () => {
    render(<HostSwitch open={false} action={async () => {}} label="تسجيل الحضور مفتوح" noScript={null} />);
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("★ the server's HTML — before hydration — is disabled: a tap then would flip the thumb and submit nothing", () => {
    const html = renderToString(<HostSwitch open action={async () => {}} label="تسجيل الحضور مفتوح" noScript={null} />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector('input[role="switch"]')?.hasAttribute("disabled")).toBe(true);
  });
});
