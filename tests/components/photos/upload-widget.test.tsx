// UploadWidget — REQ-EVT-009/010/011. Real ar/photos.json; only `fetch` and
// the router are mocked, same pattern as tests/components/materials/
// upload-form.test.tsx (this widget talks to the two Route Handlers
// directly, never the DAL, so there is nothing else to mock).
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ar from "@/messages/ar/photos.json";

const refresh = vi.fn();
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh }),
}));

const { UploadWidget } = await import("@/components/photos/upload-widget");

function renderWidget() {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <UploadWidget locale="ar" sessionId="11111111-1111-1111-1111-111111111111" />
    </NextIntlClientProvider>,
  );
}

function makeFile(name: string, type: string, bytes = 10) {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("UploadWidget", () => {
  beforeEach(() => {
    refresh.mockClear();
  });

  it("★ drives initiate → PUT-to-signed-URL → complete, then refreshes (07 §1)", async () => {
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
    fireEvent.change(screen.getByLabelText(ar.photos.upload.fileLabel), { target: { files: [makeFile("photo.jpg", "image/jpeg")] } });
    fireEvent.click(screen.getByRole("button", { name: ar.photos.upload.action }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/upload/photo", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/upload/photo/complete", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText(ar.photos.upload.processing)).toBeInTheDocument();
  });

  it("shows the not-authorized message from initiate, with no PUT ever attempted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "not_authorized" }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    renderWidget();
    fireEvent.change(screen.getByLabelText(ar.photos.upload.fileLabel), { target: { files: [makeFile("photo.jpg", "image/jpeg")] } });
    fireEvent.click(screen.getByRole("button", { name: ar.photos.upload.action }));

    await waitFor(() => expect(screen.getByText(ar.photos.upload.notAuthorized)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("requires a file before submitting", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: ar.photos.upload.action }));
    await waitFor(() => expect(screen.getByText(ar.photos.upload.fileRequired)).toBeInTheDocument());
  });
});
