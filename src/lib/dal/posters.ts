import "server-only";
import { randomUUID } from "node:crypto";
import { cache } from "react";
import { z } from "zod";
import { imageSize, PRESETS, presetsFor, SCHEMA_VERSION, type DesignDocument, type PresetName } from "@kareem/designer-runtime";
import { storagePaths } from "@/lib/storage/paths";
import { sniffContent } from "@/lib/storage/sniff";
import { sessionClient } from "@/lib/dal/session";

// Design assets and uploaded posters — REQ-DSG-018, REQ-DSG-019, REQ-DSG-020,
// DEC-009, DEC-012, A31, A32.
//
// NO SVG, ANYWHERE, AND THE CHECK IS ON THE BYTES. An SVG renamed `.png` is
// rejected on its content after it lands, never on its name. DEC-009 dropped
// the format rather than sanitising it, because an SVG is XML that can carry
// `<script>` and external references and it would be rendered inside a
// privileged headless Chromium — so there is no sanitiser to maintain and no
// bypass to track. `sniffContent()` (07 §2.1) is the same function the
// materials pipeline uses; a second copy here would be a second thing to
// keep correct.
//
// AN UPLOADED POSTER IS A DOCUMENT, NOT A SECOND PIPELINE. A32 wants every
// variant to exist after an upload, with a per-variant crop override. That is
// exactly what the document model already does: one full-bleed image layer,
// `scale: 'fill'`, a focal point per preset. So an upload produces a document
// and goes through `derive()` and the same render queue as everything else —
// no smart-crop service, no second place for a variant to be wrong, and the
// crop override is a field rather than a feature.

export const MIN_UPLOADED_POSTER_SHORT_SIDE = 1080;

export type AssetExt = "png" | "jpg" | "webp";

const SNIFF_TO_EXT: Record<string, AssetExt> = { png: "png", jpeg: "jpg", webp: "webp" };
const SNIFF_TO_MIME: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

export const initiateAssetInput = z.object({
  /** Bytes, so the org's limit is refused BEFORE the upload rather than
   *  after it (`org_settings.limit_image_mb`). */
  byteSize: z.number().int().positive(),
  /** What the client thinks it is. Advisory only — the sniff decides. */
  declaredType: z.string().max(100).optional(),
  /** Set when the upload is a finished poster, which the org sizes on its
   *  own limit (`org_settings.limit_poster_mb`) rather than the image one. */
  sessionId: z.uuid().optional(),
});

export const completeAssetInput = z.object({
  assetId: z.uuid(),
  /** The poster path, when this upload is a finished poster for a session
   *  (REQ-DSG-020's third path). */
  sessionId: z.uuid().optional(),
});

export interface InitiatedAsset {
  assetId: string;
  /** Where the browser PUTs the bytes. They never traverse this process. */
  uploadUrl: string;
  path: string;
}

export type AssetFailure =
  | { status: "not_authorized" }
  | { status: "file_too_large"; limitMb: number }
  | { status: "rejected_content"; sniffed: string }
  | { status: "too_small"; shortSide: number; minimum: number }
  | { status: "unreadable" };

/**
 * Step 1 — a signed URL and an id. The extension is not known yet, because
 * the extension follows the SNIFF, not the filename; the object is uploaded
 * under a neutral path and the row is written in step 2.
 */
export async function initiateAssetUpload(locale: string, input: z.infer<typeof initiateAssetInput>): Promise<InitiatedAsset | AssetFailure> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin") return { status: "not_authorized" };

  const { data: settings } = await supabase.from("org_settings").select("limit_image_mb, limit_poster_mb").eq("org_id", session.orgId).maybeSingle();
  const limitMb = ((input.sessionId ? settings?.limit_poster_mb : settings?.limit_image_mb) as number | undefined) ?? 20;
  if (input.byteSize > limitMb * 1024 * 1024) return { status: "file_too_large", limitMb };

  const assetId = randomUUID();
  // The one path builder (03 §6) — the only place in the design where
  // isolation depends on application correctness. `png` is a placeholder
  // extension for the signed URL; the stored row records what the sniff saw.
  const { bucket, path } = storagePaths.designAsset(session.orgId, assetId, "png");
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) return { status: "not_authorized" };

  return { assetId, uploadUrl: data.signedUrl, path };
}

/**
 * Step 2 — read the landed bytes back, sniff them, measure them, record them.
 *
 * The read works because `design_assets_storage_read` (0037) grants an org
 * admin its own org's prefix, and an org admin is the only person who can
 * reach this at all. That is the difference from the photo pipeline, where
 * the policy denies even the uploader until a row exists and the strip has
 * to happen in the worker.
 */
export async function completeAssetUpload(
  locale: string,
  input: z.infer<typeof completeAssetInput>,
): Promise<{ status: "ok"; assetId: string; width: number; height: number } | AssetFailure> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin") return { status: "not_authorized" };

  const { bucket, path } = storagePaths.designAsset(session.orgId, input.assetId, "png");
  const { data: blob } = await supabase.storage.from(bucket).download(path);
  if (!blob) return { status: "unreadable" };
  const bytes = new Uint8Array(await blob.arrayBuffer());

  // ★ DEC-009 / REQ-DSG-018: on the CONTENT, after the bytes land.
  const sniffed = sniffContent(bytes);
  const ext = SNIFF_TO_EXT[sniffed.kind];
  if (!ext) {
    // Includes `svg` explicitly, and everything else. The object stays where
    // it is with no row pointing at it; nothing renders an asset that has no
    // `design_assets` row.
    await supabase.storage.from(bucket).remove([path]);
    return { status: "rejected_content", sniffed: sniffed.kind };
  }

  const size = imageSize(bytes);
  if (!size) {
    await supabase.storage.from(bucket).remove([path]);
    return { status: "unreadable" };
  }

  // A32: a finished poster must be at least 1080 px on the short side. A
  // smaller one cannot produce a story or an A3 that is worth printing, and
  // the PPI guard would block it later anyway — saying so now is cheaper.
  if (input.sessionId) {
    const shortSide = Math.min(size.width, size.height);
    if (shortSide < MIN_UPLOADED_POSTER_SHORT_SIDE) {
      await supabase.storage.from(bucket).remove([path]);
      return { status: "too_small", shortSide, minimum: MIN_UPLOADED_POSTER_SHORT_SIDE };
    }
  }

  const { error } = await supabase.from("design_assets").insert({
    id: input.assetId,
    org_id: session.orgId,
    storage_path: path,
    sniffed_mime: SNIFF_TO_MIME[sniffed.kind] as string,
    width: size.width,
    height: size.height,
    byte_size: bytes.byteLength,
    uploaded_by: session.memberId,
  });
  // 23514 is the table's own `sniffed_mime` check — belt and braces on the
  // sniff above, and the reason DEC-009 says the constraint is on the
  // SNIFFED type rather than the filename.
  if (error) return error.code === "23514" ? { status: "rejected_content", sniffed: sniffed.kind } : { status: "not_authorized" };

  return { status: "ok", assetId: input.assetId, width: size.width, height: size.height };
}

/**
 * The document an uploaded poster becomes — REQ-DSG-020, A32.
 *
 * One image layer, full bleed, `fill` on every preset so each variant crops
 * rather than letterboxes. The focal point starts centred (a saliency-free
 * centre-weighted crop is the honest default), and the admin overrides it
 * per variant from the editor.
 */
export function uploadedPosterDocument(assetId: string): DesignDocument {
  const master = PRESETS.master;
  const presets: Record<string, { scale: "fill"; anchor: "center" }> = {};
  for (const name of presetsFor("poster")) presets[name] = { scale: "fill", anchor: "center" };

  return {
    schemaVersion: SCHEMA_VERSION,
    purpose: "poster",
    master: { width: master.width, height: master.height, unit: "px", dpi: master.dpi },
    direction: "rtl",
    layers: [
      {
        id: "uploaded",
        kind: "image",
        // Full bleed: an uploaded poster IS the page, so it starts at the
        // page edge rather than inside the safe area.
        frame: { x: 0, y: 0, w: master.width, h: master.height },
        // Locked: there is nothing to compose. Moving the only layer of an
        // uploaded poster can only make it wrong.
        locked: true,
        image: { assetId, fit: "cover", focal: { x: 0.5, y: 0.5 } },
        presets,
      },
    ],
  };
}

export const uploadPosterInput = z.object({ sessionId: z.uuid(), assetId: z.uuid() });

/**
 * DEC-012's third path. An uploaded poster is `detached` FROM THE START —
 * there is no template to regenerate it from, so a later change to the
 * session's details flags it stale and prompts a review instead of
 * overwriting someone's finished artwork.
 */
export async function attachUploadedPoster(
  locale: string,
  input: z.infer<typeof uploadPosterInput>,
): Promise<{ status: "ok"; documentId: string } | { status: "not_authorized" }> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin") return { status: "not_authorized" };

  const { data: document, error: documentError } = await supabase
    .from("design_documents")
    .insert({
      org_id: session.orgId,
      purpose: "poster",
      document: uploadedPosterDocument(input.assetId),
      bound_session_id: input.sessionId,
      updated_by: session.memberId,
    })
    .select("id")
    .maybeSingle();
  if (documentError || !document) return { status: "not_authorized" };

  const { error } = await supabase.from("session_posters").upsert(
    {
      org_id: session.orgId,
      session_id: input.sessionId,
      document_id: document.id,
      mode: "uploaded",
      binding: "detached",
      detached_at: new Date().toISOString(),
      uploaded_asset_id: input.assetId,
      stale_since: null,
    },
    { onConflict: "session_id" },
  );
  if (error) return { status: "not_authorized" };

  return { status: "ok", documentId: document.id as string };
}

/** The per-variant crop override (A32). Writes the focal point into the
 *  layer's `presets` entry for one preset and leaves the others alone. */
export function withVariantCrop(document: DesignDocument, layerId: string, preset: PresetName, focal: { x: number; y: number }): DesignDocument {
  return {
    ...document,
    layers: document.layers.map((layer) =>
      layer.id === layerId
        ? { ...layer, presets: { ...layer.presets, [preset]: { ...(layer.presets?.[preset] ?? {}), focal } } }
        : layer,
    ),
  };
}

/** The intrinsic sizes of whatever each image layer resolves to, for the PPI
 *  guard. One query rather than one per layer. */
export async function assetSizesFor(locale: string, document: DesignDocument): Promise<Record<string, { width: number; height: number }>> {
  const ids = document.layers.flatMap((l) => (l.kind === "image" && l.image.assetId ? [l.image.assetId] : []));
  if (!ids.length) return {};

  const { supabase } = await sessionClient(locale);
  const { data } = await supabase.from("design_assets").select("id, width, height").in("id", [...new Set(ids)]);
  const byId = new Map((data ?? []).map((a) => [a.id as string, { width: (a.width as number) ?? 0, height: (a.height as number) ?? 0 }]));

  const out: Record<string, { width: number; height: number }> = {};
  for (const layer of document.layers) {
    if (layer.kind !== "image" || !layer.image.assetId) continue;
    const size = byId.get(layer.image.assetId);
    // Keyed by LAYER id, because the PPI guard asks about a layer's frame:
    // the same logo in two frames has two answers.
    if (size) out[layer.id] = size;
  }
  return out;
}

/* ── the session's poster, for the slots (REQ-DSG-001 … REQ-DSG-003) ────── */

export type PosterMode = "auto" | "customised" | "uploaded";
export type PosterBinding = "live" | "detached";

export interface SessionPosterData {
  sessionId: string;
  documentId: string | null;
  mode: PosterMode;
  binding: PosterBinding;
  /** Set when session details moved under a DETACHED poster. The prompt, not
   *  an overwrite — DEC-012's asymmetry made visible. */
  staleSince: string | null;
  /** A signed URL for the variant asked for, when one has rendered. */
  imageUrl: string | null;
  /** The artifact's own pixel size, for reserving the box before the image
   *  arrives. The master's ratio is a reasonable constant but it is the
   *  WRONG one for `square` or `og`, and a box reserved at the wrong ratio
   *  shifts the page exactly as badly as no box at all. */
  width: number | null;
  height: number | null;
  /** Every variant's state, for the picker's queue line. */
  ready: number;
  total: number;
}

/** The preset each surface asks for. `og` is 1200×630 and reads at about
 *  600 px in an email client; a browse card wants the square. */
export type PosterVariant = "master" | "square" | "og" | "landscape";

/**
 * The poster for one session. `null` when the session has none — which the
 * slot renders as nothing rather than as a broken frame, because a session
 * whose render has not finished is the same to a reader as one with no
 * poster at all.
 *
 * ★ Request-scoped `cache()` (wave 6, DEC-130): the event page draws the poster
 * twice — in the hero from `md` up, and under «نبذة» on the phone — and each
 * read was its own round trip plus a signed URL. No logic change; no caller
 * reads it inside a Server Action, where a cached read could outlive a write.
 */
export const getSessionPoster = cache(loadSessionPoster);

async function loadSessionPoster(locale: string, sessionId: string, variant: PosterVariant = "master"): Promise<SessionPosterData | null> {
  const { supabase } = await sessionClient(locale);

  const { data: poster } = await supabase
    .from("session_posters")
    .select("session_id, document_id, mode, binding, stale_since")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!poster) return null;

  const documentId = (poster.document_id as string | null) ?? null;
  let imageUrl: string | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let ready = 0;
  let total = 0;

  if (documentId) {
    // Only the newest fingerprint's artifacts matter: an older one describes
    // a session that has since changed (REQ-DSG-013).
    const { data: artifacts } = await supabase
      .from("export_artifacts")
      .select("preset, format, status, storage_path, source_fingerprint, rendered_at, width_px, height_px")
      .eq("document_id", documentId)
      .order("rendered_at", { ascending: false });

    const newest = artifacts?.find((a) => a.status === "ready")?.source_fingerprint ?? artifacts?.[0]?.source_fingerprint;
    const current = (artifacts ?? []).filter((a) => a.source_fingerprint === newest);
    total = current.length;
    ready = current.filter((a) => a.status === "ready").length;

    const match = current.find((a) => a.preset === variant && a.status === "ready" && a.storage_path) ?? current.find((a) => a.status === "ready" && a.storage_path);
    if (match?.storage_path) {
      const { data } = await supabase.storage.from("exports").createSignedUrl(match.storage_path as string, 300);
      imageUrl = data?.signedUrl ?? null;
      width = (match.width_px as number | null) ?? null;
      height = (match.height_px as number | null) ?? null;
    }
  }

  return {
    sessionId,
    documentId,
    mode: poster.mode as PosterMode,
    binding: poster.binding as PosterBinding,
    staleSince: (poster.stale_since as string | null) ?? null,
    imageUrl,
    width,
    height,
    ready,
    total,
  };
}

/**
 * DEC-012 / REQ-DSG-003 — the one-way flip.
 *
 * ★ CONFIRMED, NEVER IMPLIED (REQ-UIX-013 names «detaching a poster»). Until
 * wave 8 nothing called this: the copy said «the first edit detaches», but an
 * edit to a live poster's document saved and left it `live`, so the next title
 * change regenerated from the template and the admin's work never reached an
 * export. Now the picker's «خصّص» and the studio's gate both go through a
 * dialog that names the session and then call this, and a save to a live
 * poster is refused (`saveDesignDocument`). The returned document is where the
 * studio opens.
 */
export async function detachPoster(locale: string, sessionId: string): Promise<{ status: "ok"; documentId: string | null } | { status: "not_authorized" }> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("detach_poster", { p_session: sessionId });
  if (error) return { status: "not_authorized" };
  const row = (Array.isArray(data) ? data[0] : data) as { document_id?: string | null } | null;
  return { status: "ok", documentId: row?.document_id ?? null };
}

/* ── SCR-043's picker (DEC-012, `16` §10.3) ─────────────────────────────── */

export interface PosterPickerData {
  sessionTitle: string;
  /** Detaching, uploading and opening the studio are an org admin's acts. */
  canEdit: boolean;
  /** `org_settings.limit_poster_mb`, stated before the picker opens. */
  limitMb: number;
  poster: SessionPosterData | null;
}

/** Everything the three cards need, `null` when the session is not this
 *  org's. The poster itself is the slot's own read, shared through `cache()`. */
export async function getPosterPicker(locale: string, sessionId: string): Promise<PosterPickerData | null> {
  const { session, supabase } = await sessionClient(locale);
  const [{ data: sessionRow }, { data: settings }, poster] = await Promise.all([
    supabase.from("sessions").select("title").eq("id", sessionId).maybeSingle(),
    supabase.from("org_settings").select("limit_poster_mb").eq("org_id", session.orgId).maybeSingle(),
    getSessionPoster(locale, sessionId, "square"),
  ]);
  if (!sessionRow) return null;
  return {
    sessionTitle: sessionRow.title as string,
    canEdit: session.role === "admin",
    limitMb: (settings?.limit_poster_mb as number | undefined) ?? 20,
    poster,
  };
}

/** A signed URL for a design asset, five minutes. `null` when the id names
 *  no asset this org may read — which the canvas renders as a marked
 *  placeholder rather than a broken image (REQ-DSG-006). */
export async function signDesignAssetUrl(locale: string, assetId: string): Promise<string | null> {
  // Already a URL (wave 4 may hand one over directly) — nothing to sign.
  if (/^https?:\/\//.test(assetId)) return assetId;
  const { supabase } = await sessionClient(locale);
  const { data: asset } = await supabase.from("design_assets").select("storage_path").eq("id", assetId).maybeSingle();
  if (!asset?.storage_path) return null;
  const { data } = await supabase.storage.from("design-assets").createSignedUrl(asset.storage_path as string, 300);
  return data?.signedUrl ?? null;
}
