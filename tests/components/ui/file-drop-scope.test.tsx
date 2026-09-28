// `<FileDrop>` inside the playground's scope — DEC-183, DEC-186 §2 and §5, REQ-UIX-030.
//
// New cases live here, never in `file-drop.test.tsx`, which is evidence (DEC-186 §9). Tokens only
// and NO ANIMATION inside the scope; the scope's look is added under `pg:`, never replacing a class.
import type React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { FileDrop } from "@/components/ui/file-drop";
import ar from "@/messages/ar/browse.json";

function Wrap({ scope, children }: { scope?: boolean; children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={ar}>
      <main className={scope ? "theme-play" : undefined}>{children}</main>
    </NextIntlClientProvider>
  );
}

function classes(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

function expectAdded(el: Element | null, before: string[], added: string[]) {
  const got = classes(el);
  for (const cls of before) expect(got, cls).toContain(cls);
  expect(got.filter((c) => !before.includes(c)).sort()).toEqual([...added].sort());
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

const T = ar.browse.fileDrop;

function pdf(name = "الدرس-الأول.pdf", size = 1024): File {
  return new File([new Uint8Array(size)], name, { type: "application/pdf" });
}

// The class strings as they stood at `886260a`, before wave 15.
const ZONE = "flex flex-col items-center gap-3 rounded-card border-2 border-dashed px-6 py-8 text-center transition-colors duration-150".split(" ");
const CHOOSER =
  "inline-flex h-11 items-center rounded-field border border-edge-strong px-5 text-label text-fg-heading hover:bg-silver-100 disabled:cursor-not-allowed disabled:opacity-50".split(" ");
const ROW = "flex items-center gap-2 rounded-field border border-edge p-2".split(" ");
const REMOVE = "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-silver-100 hover:text-fg-heading".split(" ");

function zone() {
  return screen.getByText(T.dropHint).parentElement!;
}

describe("FileDrop — the scope adds, it never replaces", () => {
  it("at rest the zone keeps every class, and inside the scope takes the panel radius with no transition", () => {
    render(
      <Wrap>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={1_000_000} />
      </Wrap>,
    );
    expectAdded(zone(), [...ZONE, "border-edge-strong"], ["pg:rounded-panel", "pg:transition-none"]);
  });

  it("invalid keeps its error border and takes the on-dark constant in a dark scope", () => {
    render(
      <Wrap>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={1_000_000} invalid />
      </Wrap>,
    );
    expectAdded(zone(), [...ZONE, "border-error-border"], ["pg:rounded-panel", "pg:transition-none", "pg-dark:border-error-on-dark"]);
  });

  it("disabled keeps its opacity", () => {
    render(
      <Wrap>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={1_000_000} disabled />
      </Wrap>,
    );
    expectAdded(zone(), [...ZONE, "border-edge-strong", "opacity-50"], ["pg:rounded-panel", "pg:transition-none"]);
  });

  it("drag-over takes the accent's border on the raised surface inside the scope", () => {
    render(
      <Wrap>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={1_000_000} />
      </Wrap>,
    );
    fireEvent.dragOver(zone(), { dataTransfer: { files: [pdf()] } });
    expect(zone()).toHaveClass("pg:border-accent", "pg:bg-raised", "pg:transition-none");
  });

  it("the chooser keeps every class and becomes a pill", () => {
    render(
      <Wrap>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={1_000_000} />
      </Wrap>,
    );
    expectAdded(screen.getByRole("button", { name: T.chooseFiles }), CHOOSER, ["pg:rounded-pill", "pg:hover:bg-hover"]);
  });

  it("a picked file's row and its remove control keep every class; the remove gains a 44 px hit area", async () => {
    render(
      <Wrap>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={1_000_000} />
      </Wrap>,
    );
    fireEvent.drop(zone(), { dataTransfer: { files: [pdf()] } });
    const row = await waitFor(() => screen.getByText("الدرس-الأول.pdf").closest("li"));
    expectAdded(row, ROW, ["pg:rounded-input"]);
    const remove = row!.querySelector("button");
    // 28 px + 8 px on each side = 44 px.
    expectAdded(remove, REMOVE, ["pg:relative", "pg:after:absolute", "pg:after:-inset-2", "pg:after:content-['']", "pg:hover:bg-hover"]);
  });

  it("a refused file's message takes the error's on-dark constant in a dark scope", async () => {
    render(
      <Wrap>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={10} />
      </Wrap>,
    );
    fireEvent.drop(zone(), { dataTransfer: { files: [pdf("كبير.pdf", 2048)] } });
    const message = await waitFor(() => screen.getByText(T.tooLarge));
    expect(message).toHaveClass("text-error", "pg-dark:text-error-on-dark");
  });

  it("moves nothing inside the scope: every animated class is switched off there", () => {
    render(
      <Wrap>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={1_000_000} />
      </Wrap>,
    );
    const scoped = classes(zone()).filter((c) => c.startsWith("pg"));
    expect(scoped).toContain("pg:transition-none");
    expect(scoped.some((c) => /animate|duration|transition-(?!none)/.test(c))).toBe(false);
  });

  it("is accessible inside the scope with a picked and a refused file", async () => {
    const { container } = render(
      <Wrap scope>
        <FileDrop name="material" accept={["application/pdf"]} maxBytes={1500} requirements={["PDF فقط"]} multiple />
      </Wrap>,
    );
    fireEvent.drop(zone(), { dataTransfer: { files: [pdf(), pdf("كبير.pdf", 4096)] } });
    await waitFor(() => screen.getByText(T.tooLarge));
    await expectAccessible(container);
  });
});
