// STORY-MAT-005 — the presenter/admin's upload form (REQ-MAT-001, REQ-MAT-009,
// REQ-MAT-012, REQ-UIX-024). Real ar/materials.json (plus browse.json's
// fileDrop namespace, which ui/file-drop reads) through
// NextIntlClientProvider; only `fetch` and the router are mocked — the form
// itself talks to the two Route Handlers directly (07 §1: bytes never
// traverse this app's server), not the DAL, so there is nothing else to
// mock. `ui/file-drop` replaces the old raw `<input type="file">`, so a file
// selection is driven through it (tests/components/ui/file-drop.test.tsx's
// own convention: `document.querySelector('input[type="file"]')`, since the
// hidden native input carries no accessible label of its own — the button
// and the drop zone are the two labelled affordances).
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ar from "@/messages/ar/materials.json";
import arBrowse from "@/messages/ar/browse.json";
import { ToastProvider } from "@/components/ui/toast";

const refresh = vi.fn();
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh }),
}));

const { UploadForm } = await import("@/components/materials/upload-form");

const messages = { ...ar, browse: { fileDrop: arBrowse.browse.fileDrop } };
const uploadLimits = { documentMb: 50, audioMb: 200, imageMb: 20 };

function renderForm() {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <UploadForm locale="ar" sessionId="11111111-1111-1111-1111-111111111111" uploadLimits={uploadLimits} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

function makeFile(name: string, type: string, bytes = 10) {
  return new File([new Uint8Array(bytes)], name, { type });
}

function pickFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("UploadForm", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("states PDF and the org's own 50 MB limit BEFORE any file is chosen (REQ-UIX-024)", () => {
    renderForm();
    expect(screen.getByText("PDF فقط · حتى 50 ميغابايت")).toBeInTheDocument();
  });

  it("the requirement line updates when the kind changes — image shows the org's own 20 MB limit", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(ar.materials.upload.kindLabel), { target: { value: "image" } });
    expect(screen.getByText("JPEG أو PNG أو WebP · حتى 20 ميغابايت")).toBeInTheDocument();
  });

  it("★ drives initiate → PUT-to-signed-URL → complete, then refreshes and confirms (07 §1: bytes never traverse this app's server)", async () => {
    const fetchMock = vi.fn();
    (fetchMock as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/upload/material") {
        return new Response(
          JSON.stringify({
            materialId: "mat-1",
            upload: { versionId: "v1", bucket: "materials", path: "org/sess/v1/deck.pdf", signedUrl: "https://storage.example/signed?token=abc", token: "abc" },
          }),
          { status: 201 },
        );
      }
      if (url === "https://storage.example/signed?token=abc") {
        expect(init?.method).toBe("PUT");
        return new Response(null, { status: 200 });
      }
      if (url === "/api/upload/material/complete") {
        return new Response(JSON.stringify({ versionId: "v1", version: 1, renderStatus: "pending", sniffedMime: "application/pdf" }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderForm();
    fireEvent.change(screen.getByLabelText(ar.materials.upload.titleLabel), { target: { value: "شرائح الافتتاح" } });
    pickFile(makeFile("deck.pdf", "application/pdf"));
    fireEvent.click(screen.getByRole("button", { name: ar.materials.upload.submit }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/upload/material", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/upload/material/complete", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText(ar.materials.upload.success)).toBeInTheDocument();
  });

  it("shows the size-limit message naming the org's own limit, with no PUT ever attempted, and confirms nothing refreshed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "file_too_large", limitMb: 50 }), { status: 413 }));
    vi.stubGlobal("fetch", fetchMock);

    renderForm();
    fireEvent.change(screen.getByLabelText(ar.materials.upload.titleLabel), { target: { value: "ملف كبير" } });
    pickFile(makeFile("big.pdf", "application/pdf"));
    fireEvent.click(screen.getByRole("button", { name: ar.materials.upload.submit }));

    // The limit is inside its own <bdi>, so the sentence spans multiple text nodes.
    await waitFor(() => expect(screen.getAllByText((_, el) => el?.textContent === "الملف أكبر من الحد المسموح (50 م.ب).")).not.toHaveLength(0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("★ a sniff mismatch (an SVG named .png — DEC-009) surfaces the mismatch message from /complete", async () => {
    const fetchMock = vi.fn();
    (fetchMock as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(async (url: string) => {
      if (url === "/api/upload/material") {
        return new Response(
          JSON.stringify({ materialId: "mat-2", upload: { versionId: "v2", bucket: "materials", path: "org/sess/v2/pic.png", signedUrl: "https://storage.example/signed2", token: "t" } }),
          { status: 201 },
        );
      }
      if (url === "https://storage.example/signed2") return new Response(null, { status: 200 });
      if (url === "/api/upload/material/complete") return new Response(JSON.stringify({ error: "sniff_mismatch", sniffedKind: "svg" }), { status: 415 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderForm();
    fireEvent.change(screen.getByLabelText(ar.materials.upload.kindLabel), { target: { value: "image" } });
    fireEvent.change(screen.getByLabelText(ar.materials.upload.titleLabel), { target: { value: "صورة" } });
    pickFile(makeFile("pic.png", "image/png"));
    fireEvent.click(screen.getByRole("button", { name: ar.materials.upload.submit }));

    await waitFor(() => expect(screen.getAllByText(ar.materials.upload.sniffMismatch)).not.toHaveLength(0));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a link kind (video_link) needs no file picker and completes after the one POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ materialId: "mat-3", upload: null }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    renderForm();
    fireEvent.change(screen.getByLabelText(ar.materials.upload.kindLabel), { target: { value: "video_link" } });
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(ar.materials.upload.titleLabel), { target: { value: "تسجيل" } });
    fireEvent.change(screen.getByLabelText(ar.materials.upload.urlLabel), { target: { value: "https://youtube.com/watch?v=x" } });
    fireEvent.click(screen.getByRole("button", { name: ar.materials.upload.submit }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("★ the submit button stays disabled with a file but no title — the lead's live-build finding: an enabled dark primary over nothing to submit reads as dead", () => {
    renderForm();
    pickFile(makeFile("deck.pdf", "application/pdf"));
    expect(screen.getByRole("button", { name: ar.materials.upload.submit })).toBeDisabled();
  });

  it("enables the submit button once both a title and a file are ready", () => {
    renderForm();
    pickFile(makeFile("deck.pdf", "application/pdf"));
    fireEvent.change(screen.getByLabelText(ar.materials.upload.titleLabel), { target: { value: "شرائح" } });
    expect(screen.getByRole("button", { name: ar.materials.upload.submit })).toBeEnabled();
  });
});
