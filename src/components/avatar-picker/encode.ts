import { sourceSquare, type CropView, type ImageSize } from "./crop-geometry";

// The crop's output (REQ-PRF-017, AVA-06): the circle's square at 1024 px, as a JPEG no larger than the upload
// route's cap. Re-encoding through a canvas also leaves the original's EXIF behind before it leaves the phone — the
// server strips it again regardless (the client is never the boundary, `REQ-PRF-010`).

export const OUTPUT_SIDE = 1024;
/** The quality ladder: from 0.92, down by 0.08, to 0.44 — 1024 px never needs the last rung, and nothing assumes it. */
export const QUALITIES = [0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44] as const;

/** The one call that needs a real canvas — injected, so the ladder is tested without one. */
export type JpegEncoder = (quality: number) => Promise<Blob | null>;

/** The first rung under `maxBytes`, or null when even the last is over. */
export async function encodeUnder(encode: JpegEncoder, maxBytes: number): Promise<Blob | null> {
  for (const quality of QUALITIES) {
    const blob = await encode(quality);
    if (blob && blob.size <= maxBytes) return blob;
  }
  return null;
}

/** Draws the circle's square of `bitmap` onto a 1024 px canvas and encodes it under `maxBytes`. */
export async function encodeSquare(bitmap: CanvasImageSource & ImageSize, circle: number, view: CropView, maxBytes: number): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIDE;
  canvas.height = OUTPUT_SIDE;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const { sx, sy, side } = sourceSquare(bitmap, circle, view);
  // A JPEG has no alpha: a ground under the image, so a transparent PNG does not turn black at its edges.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, OUTPUT_SIDE, OUTPUT_SIDE);
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, sx, sy, side, side, 0, 0, OUTPUT_SIDE, OUTPUT_SIDE);
  return encodeUnder((quality) => new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality)), maxBytes);
}
