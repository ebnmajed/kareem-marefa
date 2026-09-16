// UploadWidget — REQ-EVT-009/010/011, REQ-UIX-024. Real ar/photos.json
// (plus browse.json's fileDrop namespace, which ui/file-drop reads); only
// `fetch` and the router are mocked, same pattern as tests/components/
// materials/upload-form.test.tsx (this widget talks to the two Route
// Handlers directly, never the DAL). `ui/file-drop` replaces the old raw
// `<input type="file">` — see that test's own header for why a file
// selection is driven through `document.querySelector('input[type="file"]')`.
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ar from "@/messages/ar/photos.json";
import arBrowse from "@/messages/ar/browse.json";
import { ToastProvider } from "@/components/ui/toast";

const refresh = vi.fn();
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh }),
}));

const { UploadWidget } = await import("@/components/photos/upload-widget");

const messages = { ...ar, browse: { fileDrop: arBrowse.browse.fileDrop } };

function renderWidget() {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <UploadWidget locale="ar" sessionId="11111111-1111-1111-1111-111111111111" imageLimitMb={20} />
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

describe("UploadWidget", () => {
  beforeEach(() => {
    refresh.mockClear();
  });

  it("states JPEG/PNG/WebP and the org's own 20 MB limit BEFORE any file is chosen (REQ-UIX-024)", () => {
    renderWidget();
    expect(screen.getByText("JPEG أو PNG أو WebP · حتى 20 ميغابايت")).toBeInTheDocument();
  });

  it("★ drives initiate → PUT-to-signed-URL → complete, then refreshes and confirms it is processing (07 §1)", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/upload/photo") {
        return new Response(
          JSON.stringify({ photoId: "photo-1", upload: { bucket: "photos", path: "a/photos/photo-1.jpg", signedUrl: "https://storage.example/signed", token: "t", contentType: "image/jpeg" } }),
          { status: 201 },
        );
      }
      if (url === "https://storage.example/signed") {
        expect(init?.method).toBe("PUT");
        return new Response(null, { status: 200 });
      }
      if (url === "/api/upload/photo/complete") {
        return new Response(JSON.stringify({ status: "processing" }), { status: 202 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWidget();
    pickFile(makeFile("photo.jpg", "image/jpeg"));
    fireEvent.click(screen.getByRole("button", { name: ar.photos.upload.action }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/upload/photo", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/upload/photo/complete", expect.objectContaining({ method: "POST" }));
    // The toast IS honest about the gap (REQ-EVT-010 vs. the shipped
    // pipeline, docs/plan/notes/content.md §4.4) — "processing," not
    // "posted."
    expect(screen.getByText(ar.photos.upload.processing)).toBeInTheDocument();
  });

  it("shows the not-authorized message from initiate, with no PUT ever attempted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "not_authorized" }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    renderWidget();
    pickFile(makeFile("photo.jpg", "image/jpeg"));
    fireEvent.click(screen.getByRole("button", { name: ar.photos.upload.action }));

    await waitFor(() => expect(screen.getAllByText(ar.photos.upload.notAuthorized)).not.toHaveLength(0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("requires a file before submitting", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: ar.photos.upload.action }));
    expect(screen.getByText(ar.photos.upload.fileRequired)).toBeInTheDocument();
  });
});
