// `code-input` without JavaScript — wave 16, STATUS F1, REQ-CHK-003, REQ-UIX-035.
//
// The six boxes are a controlled component, and only React fills the hidden
// field they post through. With JS off a member typed a correct code, posted an
// empty one, and was told it was wrong. So the server renders ONE labelled
// field under the same name, and the client swaps it for the boxes once it has
// hydrated — with the first client render matching the server's.
import { act } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeInput } from "@/components/ui/code-input";

const POSITIONS = ["الخانة 1 من 6", "الخانة 2 من 6", "الخانة 3 من 6", "الخانة 4 من 6", "الخانة 5 من 6", "الخانة 6 من 6"];

function Form({ error }: { error?: string }) {
  return (
    <form>
      <CodeInput name="code" id="check-in-code" label="رمز الحضور" positionLabels={POSITIONS} error={error} />
    </form>
  );
}

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function serverHtml(error?: string): HTMLDivElement {
  const container = document.createElement("div");
  container.innerHTML = renderToString(<Form error={error} />);
  document.body.appendChild(container);
  return container;
}

describe("code-input as the server renders it — the no-JS form", () => {
  it("is one labelled field named `code`, six characters, a one-time code — and no boxes", () => {
    const container = serverHtml();
    const fields = container.querySelectorAll("input");
    expect(fields).toHaveLength(1);
    const field = fields[0];
    expect(field.name).toBe("code");
    expect(field.type).toBe("text");
    expect(field.maxLength).toBe(6);
    expect(field.getAttribute("autocomplete")).toBe("one-time-code");
    expect(field.dir).toBe("ltr");
    expect(container.querySelector(`label[for="${field.id}"]`)?.textContent).toBe("رمز الحضور");
    expect(container.querySelectorAll("input[maxlength='1']")).toHaveLength(0);
  });

  it("★ posts what the member typed under `code`, exactly as the boxes' hidden field does", () => {
    const container = serverHtml();
    // Typed where a member types: the field the visible label names.
    const label = container.querySelector("label")!;
    const field = container.querySelector<HTMLInputElement>(`#${label.htmlFor}`)!;
    field.value = "M7K3QX";
    const posted = new FormData(container.querySelector("form")!);
    expect(posted.getAll("code")).toEqual(["M7K3QX"]);
    expect([...posted.keys()]).toEqual(["code"]);
  });

  it("ties a refusal to the field, as the group ties it with JS", () => {
    const container = serverHtml("الرمز غير صحيح");
    const field = container.querySelector<HTMLInputElement>("input[name='code']")!;
    expect(field.getAttribute("aria-invalid")).toBe("true");
    const errorId = field.getAttribute("aria-describedby")!;
    expect(container.querySelector(`#${errorId}`)?.textContent).toBe("الرمز غير صحيح");
  });
});

describe("code-input once hydrated", () => {
  it("★ hydrates without a mismatch, then becomes the six boxes posting one `code`", async () => {
    const container = serverHtml();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    await act(async () => {
      root = hydrateRoot(container, <Form />, { onRecoverableError: recoverable });
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(errors.mock.calls.map((c) => String(c[0]).slice(0, 300))).toEqual([]);
    errors.mockRestore();

    expect(container.querySelectorAll("input[maxlength='1']")).toHaveLength(6);
    const posting = container.querySelectorAll<HTMLInputElement>("input[name='code']");
    expect(posting).toHaveLength(1);
    expect(posting[0].type).toBe("hidden");
  });

  it("★ a code typed before the page hydrated is carried into the boxes, not lost", async () => {
    const container = serverHtml();
    container.querySelector<HTMLInputElement>("input[name='code']")!.value = "m7k-3qx";
    await act(async () => {
      root = hydrateRoot(container, <Form />);
    });
    const boxes = [...container.querySelectorAll<HTMLInputElement>("input[maxlength='1']")];
    expect(boxes.map((b) => b.value).join("")).toBe("M7K3QX");
    expect(container.querySelector<HTMLInputElement>("input[type='hidden'][name='code']")!.value).toBe("M7K3QX");
  });
});
