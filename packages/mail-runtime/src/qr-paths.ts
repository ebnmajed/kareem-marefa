// What `/api/mail/qr` may encode — ONE rule, read by the compiler (which
// builds the image's URL) and by the route (which draws it), so the two cannot
// disagree about what a QR in a mail can point at (wave 23, `REQ-NTF-015`).
//
// ★ NOT AN OPEN QR GENERATOR. A public route that drew any text would let
// anyone mint a QR on our domain pointing anywhere. So the route takes a PATH,
// never a URL and never caller text; the path must be one of OUR pages below —
// the shapes `links.ts`' `ROUTE_FOR` produces, the public card and the public
// verification page — and the data encoded is the request's own origin plus
// that path.

const LOCALE = "(?:ar|en)";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const QR_PATHS: readonly RegExp[] = [
  new RegExp(`^/${LOCALE}/app/sessions/${UUID}(?:/rate|/materials)?$`),
  new RegExp(`^/${LOCALE}/app/propose/${UUID}$`),
  new RegExp(`^/${LOCALE}/app/me/(?:points|certificates|privacy|settings)$`),
  new RegExp(`^/${LOCALE}/s/${UUID}$`),
  new RegExp(`^/${LOCALE}/verify/[A-Za-z0-9-]{4,64}$`),
];

/** Whether a path is one a mail's QR may encode. */
export function isQrPath(path: string): boolean {
  return path.length <= 200 && QR_PATHS.some((pattern) => pattern.test(path));
}
