import type { Page } from "@playwright/test";

// Real, decodable, EXIF-free photographs for the wave-14 photo specs — the lead's
// capture review: a 1 × 1 JPEG made the lightbox capture a dot, and an
// undecodable one made every tile a broken-image icon, so neither picture could
// show «whole» or the tile's crop. These are drawn on a canvas in the page and
// encoded by the browser's own `toBlob("image/jpeg")`, which writes a JFIF
// header and no metadata. Landscape and portrait alternate, so the lightbox's
// letterbox shows on both axes and the square tile visibly crops each.

export const PHOTO_SIZES = [
  { width: 1200, height: 800 },
  { width: 800, height: 1200 },
] as const;

/** `count` JPEGs, each a different colour with its number drawn large, alternating landscape and portrait. */
export async function drawPhotos(page: Page, count: number): Promise<{ bytes: Buffer; width: number; height: number }[]> {
  const encoded = await page.evaluate(
    async ({ count, sizes }) => {
      const out: { b64: string; width: number; height: number }[] = [];
      for (let i = 0; i < count; i += 1) {
        const { width, height } = sizes[i % sizes.length];
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        const hue = (i * 67) % 360;
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, `hsl(${hue} 55% 35%)`);
        gradient.addColorStop(1, `hsl(${(hue + 40) % 360} 60% 70%)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        // A frame at the very edge: if the lightbox ever cropped, the frame would be cut.
        ctx.strokeStyle = "white";
        ctx.lineWidth = 24;
        ctx.strokeRect(12, 12, width - 24, height - 24);
        ctx.fillStyle = "white";
        ctx.font = `bold ${Math.round(Math.min(width, height) / 2.5)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i + 1), width / 2, height / 2);
        const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85));
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        out.push({ b64: btoa(binary), width, height });
      }
      return out;
    },
    { count, sizes: PHOTO_SIZES.map((s) => ({ ...s })) },
  );
  return encoded.map((e) => ({ bytes: Buffer.from(e.b64, "base64"), width: e.width, height: e.height }));
}
