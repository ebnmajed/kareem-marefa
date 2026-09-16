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
import type { BroadcastMessage } from "@/lib/realtime/channel";

const refresh = vi.fn();
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh }),
}));

// T8 (`DEC-139`): the widget waits for the session topic's own broadcast
// before refreshing, rather than refreshing right after the 202 — this
// captures the callback the widget subscribed with, so a test can fire it
// directly instead of waiting out the real 20 s fallback.
let lastOnMessage: ((message: BroadcastMessage) => void) | null = null;
vi.mock("@/lib/realtime/channel", () => ({
  subscribeToSessionTopic: vi.fn((_sessionId: string, onMessage: (message: BroadcastMessage) => void) => {
    lastOnMessage = onMessage;
    return () => {};
  }),
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
    lastOnMessage = null;
  });

  it("states JPEG/PNG/WebP and the org's own 20 MB limit BEFORE any file is chosen (REQ-UIX-024)", () => {
    renderWidget();
    expect(screen.getByText("JPEG أو PNG أو WebP · حتى 20 ميغابايت")).toBeInTheDocument();
  });

  it("★ drives initiate → PUT-to-signed-URL → complete, confirms it is processing, and does NOT refresh yet (T8, DEC-139)", async () => {
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

    // The toast IS honest about the gap (REQ-EVT-010 vs. the shipped
    // pipeline, docs/plan/notes/content.md §4.4) — "processing," not
    // "posted."
    await waitFor(() => expect(screen.getByText(ar.photos.upload.processing)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/upload/photo", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/upload/photo/complete", expect.objectContaining({ method: "POST" }));
    // ★ T8: nothing has been inserted yet at the 202 — refreshing here
    // would show nothing new, so the widget must NOT have refreshed.
    expect(refresh).not.toHaveBeenCalled();
  });

  it("★ T8: refreshes once the session topic broadcasts the uploaded photo's own id", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/upload/photo") {
        return new Response(
          JSON.stringify({ photoId: "photo-1", upload: { bucket: "photos", path: "a/photos/photo-1.jpg", signedUrl: "https://storage.example/signed", token: "t", contentType: "image/jpeg" } }),
          { status: 201 },
        );
      }
      if (url === "https://storage.example/signed") return new Response(null, { status: 200 });
      if (url === "/api/upload/photo/complete") return new Response(JSON.stringify({ status: "processing" }), { status: 202 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWidget();
    pickFile(makeFile("photo.jpg", "image/jpeg"));
    fireEvent.click(screen.getByRole("button", { name: ar.photos.upload.action }));
    await waitFor(() => expect(screen.getByText(ar.photos.upload.processing)).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();

    // A broadcast for a DIFFERENT photo (another member's, or this
    // session's own earlier one) must not resolve the wait.
    expect(lastOnMessage).toBeTruthy();
    lastOnMessage!({ event: "INSERT", payload: { id: "someone-elses-photo" } });
    expect(refresh).not.toHaveBeenCalled();

    // This upload's own id resolves it.
    lastOnMessage!({ event: "INSERT", payload: { id: "photo-1" } });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("★ T8: refreshes anyway after the fallback ceiling if the broadcast never arrives", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/upload/photo") {
        return new Response(
          JSON.stringify({ photoId: "photo-1", upload: { bucket: "photos", path: "a/photos/photo-1.jpg", signedUrl: "https://storage.example/signed", token: "t", contentType: "image/jpeg" } }),
          { status: 201 },
        );
      }
      if (url === "https://storage.example/signed") return new Response(null, { status: 200 });
      if (url === "/api/upload/photo/complete") return new Response(JSON.stringify({ status: "processing" }), { status: 202 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // Real timers for the whole async upload flow, so `waitFor`'s own
    // polling and the fetch-driven state updates interleave normally —
    // spying on `setTimeout` (not faking it) is what lets this test get at
    // the fallback's own callback without needing the flow around it to
    // run under a fake clock at all.
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    renderWidget();
    pickFile(makeFile("photo.jpg", "image/jpeg"));
    fireEvent.click(screen.getByRole("button", { name: ar.photos.upload.action }));
    await waitFor(() => expect(screen.getByText(ar.photos.upload.processing)).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();

    const scheduled = setTimeoutSpy.mock.calls.find(([, ms]) => ms === 20_000);
    expect(scheduled, "the fallback timer was armed for PROCESSING_TIMEOUT_MS").toBeTruthy();
    const callback = scheduled![0] as () => void;
    setTimeoutSpy.mockRestore();

    // Nothing ever broadcasts — invoke the armed callback directly rather
    // than fast-forwarding a real or faked clock, which is what actually
    // fires after the ceiling in production.
    callback();
    expect(refresh).toHaveBeenCalledTimes(1);
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

  it("★ the submit button is disabled with nothing to submit — the lead's live-build finding: an enabled dark primary over an empty drop zone reads as dead", () => {
    renderWidget();
    expect(screen.getByRole("button", { name: ar.photos.upload.action })).toBeDisabled();
  });

  it("enables the submit button once a file is picked", () => {
    renderWidget();
    pickFile(makeFile("photo.jpg", "image/jpeg"));
    expect(screen.getByRole("button", { name: ar.photos.upload.action })).toBeEnabled();
  });
});
