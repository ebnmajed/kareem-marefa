// A company's logo, as an href (DEC-298, `0230`) — the one resolver, as `avatarHref()` is for a member's picture.
//
// `/api/companies/{companyId}/logo?v={assetId}`: the asset id is the version — a replaced logo is a new asset, so a
// URL a browser cached as immutable never names the old bytes. null when the company has no logo, or either id is
// not a uuid (the route would 404 anyway). No `server-only`: pure, read by the DAL and its tests.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function companyLogoHref(companyId: string, logoAssetId: string | null | undefined): string | null {
  if (!logoAssetId || !UUID_RE.test(companyId) || !UUID_RE.test(logoAssetId)) return null;
  return `/api/companies/${companyId.toLowerCase()}/logo?v=${logoAssetId.toLowerCase()}`;
}
