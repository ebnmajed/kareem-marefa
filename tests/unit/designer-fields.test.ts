// The studio's field registry — REQ-UIX-110, REQ-UIX-111, REQ-CRT-010, DEC-238 §3. Every field the الحقول panel
// offers is a binding the runtime ALREADY resolves (no binding is added for the panel), the QR fields bind the URLs the
// resolver builds, {المستوى} serves the achievement family only, and «used» reads the document. And `newLayer`'s two
// wave-23 kinds add exactly the layer a tap promises.
import { describe, expect, it } from "vitest";
import {
  FIELDS,
  fieldsFor,
  fieldUsage,
  newLayer,
  resolveCertificateBindings,
  resolveSessionBindings,
  validateDocument,
  type DesignDocument,
} from "@kareem/designer-runtime";

const options = { timeZone: "Asia/Riyadh", origin: "https://example.org", orgName: "كريم معرفة" };
const session = resolveSessionBindings(
  { id: "s1", title: "عنوان", abstract: "نبذة", startsAt: "2026-10-03T16:00:00Z", venueName: "القاعة", venueAddress: "الرياض", presenters: ["أ"] },
  options,
);
const certificate = resolveCertificateBindings(
  { serial: "KM-2026-0001", verificationCode: "abc", issuedAt: "2026-10-03T16:00:00Z", recipientNameSnapshot: "عضو", sessionTitle: "عنوان", achievementName: "المستوى 3" },
  options,
);

const blank = (purpose: "poster" | "certificate"): DesignDocument => ({
  schemaVersion: 2,
  purpose,
  master: { width: 1080, height: 1350, unit: "px" },
  direction: "rtl",
  layers: [],
});

describe("the field registry", () => {
  it.each(FIELDS.map((f) => [f.binding, f] as const))("%s is resolved by the runtime for its purpose", (binding, field) => {
    const resolved = field.purposes.map((p) => (p === "poster" ? session : certificate));
    expect(resolved.some((values) => binding in values)).toBe(true);
  });

  it("the QR fields bind the URLs the resolver builds — the event page and the one /verify route", () => {
    expect(FIELDS.filter((f) => f.layer === "qr").map((f) => f.binding).sort()).toEqual(["certificate.verifyUrl", "session.eventUrl"]);
    expect(certificate["certificate.verifyUrl"]).toBe("https://example.org/ar/verify/abc");
    expect(session["session.eventUrl"]).toBe("https://example.org/ar/app/sessions/s1");
  });

  it("{المستوى} serves the achievement family only, and the session title the session kinds only", () => {
    const of = (family: string) => fieldsFor("certificate", family).map((f) => f.binding);
    expect(of("achievement")).toContain("certificate.achievementName");
    expect(of("achievement")).not.toContain("session.title");
    expect(of("attendance")).not.toContain("certificate.achievementName");
    expect(of("presenter")).toContain("session.title");
    expect(fieldsFor("poster").map((f) => f.binding)).not.toContain("recipient.name");
  });

  it("a field is «used» when the document names its binding, and a tap adds that binding", () => {
    const doc = blank("poster");
    expect(fieldUsage(doc).every((u) => !u.used)).toBe(true);
    const field = newLayer(doc, "field", { binding: "session.venueName", fallback: "المكان" });
    const qr = newLayer(doc, "qr", { binding: "session.eventUrl" });
    const next = { ...doc, layers: [field, { ...qr, id: "l_qr_2" }] };
    expect(validateDocument(next).ok).toBe(true);
    const used = Object.fromEntries(fieldUsage(next).map((u) => [u.field.binding, u.used]));
    expect(used["session.venueName"]).toBe(true);
    expect(used["session.eventUrl"]).toBe(true);
    expect(used["session.title"]).toBe(false);
  });

  it("the elements panel's shapes: a circle is an ellipse and a line is a thin rect frame", () => {
    const doc = blank("poster");
    const circle = newLayer(doc, "shape", { shape: "ellipse" });
    const line = newLayer(doc, "shape", { shape: "line" });
    expect(circle.kind === "shape" && circle.shape.type).toBe("ellipse");
    expect(line.kind === "shape" && line.shape.type).toBe("line");
    expect(line.frame.h).toBeLessThan(circle.frame.h);
    expect(validateDocument({ ...doc, layers: [circle, { ...line, id: "l_shape_2" }] }).ok).toBe(true);
  });
});
