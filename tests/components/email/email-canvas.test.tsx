// The builder's canvas measures the renderer's frame and draws a target per row — wave 23, REQ-UIX-112.
//
// ★ AND IT DOES NOT RENDER ITS FRAME ON THE SERVER. On a production hard load Next leaves an orphaned copy of the
// streamed page (DEC-145); a server-rendered iframe named `mail-canvas` had a twin there, the form's POST went into the
// twin, the twin was removed, and the visible frame stayed blank — no target was ever drawn. The server-render case
// below fails on the code that shipped in efa9e0a1.
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { act, render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fromDocument } from "@/components/email/builder-state";
import { EmailCanvas } from "@/components/email/email-canvas";
import notificationsAr from "@/messages/ar/notifications.json";
import uiAr from "@/messages/ar/ui.json";

beforeAll(() => {
  HTMLFormElement.prototype.requestSubmit = function requestSubmit() {};
});

const DOC = { schemaVersion: 1, blocks: [{ type: "heading", id: "h1", text: "جلستك غدًا", level: 1 }, { type: "paragraph", id: "p1", text: "نص" }] };

function canvas() {
  const { doc } = fromDocument(DOC);
  return (
    <NextIntlClientProvider locale="ar" messages={{ ...notificationsAr, ...uiAr }}>
      <EmailCanvas
        messageKey="MSG-reminder_1d"
        subject="s"
        documentJson={JSON.stringify(DOC)}
        doc={doc}
        tokens={new Map([["venue", "{المكان}"]])}
        width={600}
        selectedId={null}
        onSelect={vi.fn()}
        actions={{ moveUp: vi.fn(), moveDown: vi.fn(), move: vi.fn(), duplicate: vi.fn(), remove: vi.fn() }}
        slots={null}
        onRowDragStart={vi.fn()}
        onDropAt={vi.fn()}
        onEditText={vi.fn()}
        onAlign={vi.fn()}
        typeLabel={(t) => t}
      />
    </NextIntlClientProvider>
  );
}

describe("EmailCanvas", () => {
  it("★ renders no frame and no form on the server — nothing an orphaned streamed copy could carry", () => {
    const html = renderToString(canvas());
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<form");
  });

  it("names its frame uniquely, and its form posts into exactly that frame", () => {
    const { container } = render(canvas());
    const frame = container.querySelector("iframe")!;
    expect(frame.name).toMatch(/^mail-canvas-/);
    expect(container.querySelector("form")!.getAttribute("target")).toBe(frame.name);
  });

  it("★ posts each token as the board draws it — «{المكان}», braces and all", () => {
    const { container } = render(canvas());
    expect(JSON.parse((container.querySelector('input[name="tokens"]') as HTMLInputElement).value)).toEqual({ venue: "{المكان}" });
  });

  it("draws a target for every row the frame carries a data-k for, once the frame loads", async () => {
    const { doc } = fromDocument(DOC);
    const { container } = render(
      <NextIntlClientProvider locale="ar" messages={{ ...notificationsAr, ...uiAr }}>
        <EmailCanvas
          messageKey="MSG-reminder_1d"
          subject="s"
          documentJson={JSON.stringify(DOC)}
          doc={doc}
          tokens={new Map()}
          width={600}
          selectedId={null}
          onSelect={vi.fn()}
          actions={{ moveUp: vi.fn(), moveDown: vi.fn(), move: vi.fn(), duplicate: vi.fn(), remove: vi.fn() }}
          slots={null}
          onRowDragStart={vi.fn()}
          onDropAt={vi.fn()}
          onEditText={vi.fn()}
          onAlign={vi.fn()}
          typeLabel={(t) => t}
        />
      </NextIntlClientProvider>,
    );
    const frame = container.querySelector("iframe")!;
    const d = frame.contentDocument!;
    d.open();
    d.write(`<html><body><table style="max-width:560px"><tr data-k="h1"><td>جلستك غدًا</td></tr><tr data-k="p1"><td>نص</td></tr></table></body></html>`);
    d.close();
    await act(async () => {
      frame.dispatchEvent(new Event("load"));
    });
    expect(container.querySelectorAll("[data-canvas-target]")).toHaveLength(2);
  });
});
