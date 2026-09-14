// STORY-MAT-005 — the presenter/admin's upload form (REQ-MAT-001, REQ-MAT-009,
// REQ-MAT-012). Real ar/materials.json through NextIntlClientProvider; only
// `fetch` and the router are mocked — the form itself talks to the two
// Route Handlers directly (07 §1: bytes never traverse this app's server),
// not the DAL, so there is nothing else to mock.
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ar from "@/messages/ar/materials.json";

const refresh = vi.fn();
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh }),
}));

const { UploadForm } = await import("@/components/materials/upload-form");

function renderForm() {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <UploadForm locale="ar" sessionId="11111111-1111-1111-1111-111111111111" />
    </NextIntlClientProvider>,
  );
}

function makeFile(name: string, type: string, bytes = 10) {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("UploadForm", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("★ drives initiate → PUT-to-signed-URL → complete, then refreshes (07 §1: bytes never traverse this app's server)", async () => {
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
    fireEvent.change(screen.getByLabelText(ar.materials.upload.fileLabel), { target: { files: [makeFile("deck.pdf", "application/pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: ar.materials.upload.submit }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/upload/material", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/upload/material/complete", expect.objectContaining({ method: "POST" }));
  });

  it("shows the size-limit message naming the org's own limit, with no PUT ever attempted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "file_too_large", limitMb: 50 }), { status: 413 }));
    vi.stubGlobal("fetch", fetchMock);

    renderForm();
    fireEvent.change(screen.getByLabelText(ar.materials.upload.titleLabel), { target: { value: "ملف كبير" } });
    fireEvent.change(screen.getByLabelText(ar.materials.upload.fileLabel), { target: { files: [makeFile("big.pdf", "application/pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: ar.materials.upload.submit }));

    await waitFor(() => expect(screen.getByText("الملف أكبر من الحد المسموح (50 م.ب).")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    fireEvent.change(screen.getByLabelText(ar.materials.upload.fileLabel), { target: { files: [makeFile("pic.png", "image/png")] } });
    fireEvent.click(screen.getByRole("button", { name: ar.materials.upload.submit }));

    await waitFor(() => expect(screen.getByText(ar.materials.upload.sniffMismatch)).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a link kind (video_link) needs no file input and completes after the one POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ materialId: "mat-3", upload: null }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    renderForm();
    fireEvent.change(screen.getByLabelText(ar.materials.upload.kindLabel), { target: { value: "video_link" } });
    expect(screen.queryByLabelText(ar.materials.upload.fileLabel)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(ar.materials.upload.titleLabel), { target: { value: "تسجيل" } });
    fireEvent.change(screen.getByLabelText(ar.materials.upload.urlLabel), { target: { value: "https://youtube.com/watch?v=x" } });
    fireEvent.click(screen.getByRole("button", { name: ar.materials.upload.submit }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
