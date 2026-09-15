// `<FileDrop>` — `16` §4.2 Form. THE CONTROL, not the enforcement: it states
// the rules the server enforces (accept/maxBytes) as a client-side advisory
// pre-check, and never itself decides what is actually allowed — the server
// sniffs on content after the bytes land (invariant 11, DEC-009).
import type React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { describe, expect, it, vi, afterEach } from "vitest";
import axe from "axe-core";
import { FileDrop } from "@/components/ui/file-drop";
import ar from "@/messages/ar/browse.json";

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={ar}>
      {children}
    </NextIntlClientProvider>
  );
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, {
    rules: {
      "color-contrast": { enabled: false },
      // This isolated test mounts the control directly under `document.body`
      // with no `<main>` landmark around it — every real page in this
      // product has one (the skip link targets `#main`), so this is a
      // test-fixture artifact, not a real finding.
      region: { enabled: false },
    },
  });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

const T = ar.browse.fileDrop;
const t = createTranslator({ locale: "ar", messages: ar, namespace: "browse.fileDrop" });

function pdf(name = "الدرس-الأول.pdf", size = 1024): File {
  const file = new File([new Uint8Array(size)], name, { type: "application/pdf" });
  return file;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FileDrop — the two paths to the picker", () => {
  it("states the accepted-types/size rules up front, as text, not enforcement", () => {
    render(
      <Wrap>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={1000} requirements={["PDF فقط", "بحد أقصى ١ كيلوبايت"]} />
      </Wrap>,
    );
    expect(screen.getByText("PDF فقط")).toBeInTheDocument();
    expect(screen.getByText("بحد أقصى ١ كيلوبايت")).toBeInTheDocument();
  });

  it("the visible button is genuinely keyboard-reachable and opens the native picker", async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click");
    render(
      <Wrap>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={1_000_000} />
      </Wrap>,
    );
    const button = screen.getByRole("button", { name: T.chooseFiles });
    await userEvent.tab();
    expect(document.activeElement).toBe(button);
    await userEvent.keyboard("{Enter}");
    expect(clickSpy).toHaveBeenCalled();
  });

  it("also ingests a file dropped on the zone", async () => {
    const onFiles = vi.fn();
    render(
      <Wrap>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={1_000_000} onFiles={onFiles} />
      </Wrap>,
    );
    const zone = screen.getByText(T.dropHint).parentElement!;
    const file = pdf();
    fireEvent.dragOver(zone, { dataTransfer: { files: [file] } });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(onFiles).toHaveBeenCalledWith([file]));
  });
});

describe("FileDrop — per-file state", () => {
  it("shows a chosen file's name, bidi-isolated, and hands it to onFiles", async () => {
    const onFiles = vi.fn();
    render(
      <Wrap>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={1_000_000} onFiles={onFiles} />
      </Wrap>,
    );
    const file = pdf("عرض-تقديمي.pdf");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(screen.getByText("عرض-تقديمي.pdf")).toBeInTheDocument();
    await waitFor(() => expect(onFiles).toHaveBeenLastCalledWith([file]));
  });

  it("flags a file over maxBytes as a per-file error and excludes it from onFiles", async () => {
    const onFiles = vi.fn();
    render(
      <Wrap>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={10} onFiles={onFiles} />
      </Wrap>,
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, pdf("كبير.pdf", 1000));
    expect(screen.getByText(T.tooLarge)).toBeInTheDocument();
    await waitFor(() => expect(onFiles).toHaveBeenLastCalledWith([]));
  });

  it("flags an unaccepted type as a per-file error and excludes it from onFiles", async () => {
    // Via drop, not `userEvent.upload`: the OS file dialog (and
    // `userEvent.upload` itself, faithfully) already filters by the
    // input's `accept` attribute, so a mismatched type never reaches
    // `onChange` that way — which is exactly why the drag-and-drop path is
    // the one this client-side check is really for (drag-and-drop has no
    // such filtering in any browser).
    const onFiles = vi.fn();
    render(
      <Wrap>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={1_000_000} onFiles={onFiles} />
      </Wrap>,
    );
    const zone = screen.getByText(T.dropHint).parentElement!;
    const wrongType = new File(["x"], "شعار.svg", { type: "image/svg+xml" });
    fireEvent.drop(zone, { dataTransfer: { files: [wrongType] } });
    expect(screen.getByText(T.unsupportedType)).toBeInTheDocument();
    await waitFor(() => expect(onFiles).toHaveBeenLastCalledWith([]));
  });

  it("removing a file drops it from the list and from onFiles", async () => {
    const onFiles = vi.fn();
    render(
      <Wrap>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={1_000_000} onFiles={onFiles} />
      </Wrap>,
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = pdf("ملف.pdf");
    await userEvent.upload(input, file);
    await waitFor(() => expect(onFiles).toHaveBeenLastCalledWith([file]));
    await userEvent.click(screen.getByRole("button", { name: t("removeFile", { file: "ملف.pdf" }) }));
    expect(screen.queryByText("ملف.pdf")).not.toBeInTheDocument();
    await waitFor(() => expect(onFiles).toHaveBeenLastCalledWith([]));
  });

  it("replaces the single pick when multiple is not set", async () => {
    render(
      <Wrap>
        <FileDrop name="avatar" accept={["image/png"]} maxBytes={1_000_000} />
      </Wrap>,
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["a"], "أول.png", { type: "image/png" }));
    await userEvent.upload(input, new File(["b"], "ثانٍ.png", { type: "image/png" }));
    expect(screen.queryByText("أول.png")).not.toBeInTheDocument();
    expect(screen.getByText("ثانٍ.png")).toBeInTheDocument();
  });
});

describe("FileDrop — disabled", () => {
  it("disables the button and the input, and ignores a drop", () => {
    const onFiles = vi.fn();
    render(
      <Wrap>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={1_000_000} onFiles={onFiles} disabled />
      </Wrap>,
    );
    expect(screen.getByRole("button", { name: T.chooseFiles })).toBeDisabled();
    const zone = screen.getByText(T.dropHint).parentElement!;
    fireEvent.drop(zone, { dataTransfer: { files: [pdf()] } });
    expect(onFiles).not.toHaveBeenCalledWith(expect.arrayContaining([expect.anything()]));
  });
});

describe("FileDrop — axe", () => {
  it("is accessible with a pending file and an errored file together", async () => {
    render(
      <Wrap>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={10} requirements={["PDF فقط"]} />
      </Wrap>,
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, [pdf("مقبول.pdf", 5), pdf("كبير.pdf", 1000)]);
    await screen.findByText("مقبول.pdf");
    await expectAccessible(document.body);
  });
});
