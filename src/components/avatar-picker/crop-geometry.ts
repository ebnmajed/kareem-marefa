// The crop step's geometry (REQ-PRF-017, `AvatarCrop.dc.html`) — pure, so it is tested without a canvas.
//
// The image sits behind a circle of side `circle` px, centred on the stage. A view is `{ zoom, x, y }`: `zoom` is
// relative to the scale at which the image just COVERS the circle (1 … 3, the artboard's slider), and `x`/`y` are
// the image centre's offset from the circle's centre, in stage px. The image always covers the circle — every
// function here returns a clamped view, so the saved square never has an empty corner.
//
// Axes are the screen's, never logical: a photograph has no reading direction.

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;

export interface ImageSize {
  width: number;
  height: number;
}

export interface CropView {
  zoom: number;
  x: number;
  y: number;
}

/** The scale (stage px per image px) at which the image's shorter side equals the circle. */
export function coverScale(image: ImageSize, circle: number): number {
  return circle / Math.min(image.width, image.height);
}

/** Stage px per image px for a view. */
export function viewScale(image: ImageSize, circle: number, zoom: number): number {
  return coverScale(image, circle) * zoom;
}

function clamp(value: number, min: number, max: number): number {
  // `+ 0` turns a −0 into 0, so a view is equal to the view it should be.
  return Math.min(max, Math.max(min, value)) + 0;
}

/** The view, with its zoom in range and its offset kept so the image still covers the circle. */
export function clampView(image: ImageSize, circle: number, view: CropView): CropView {
  const zoom = clamp(view.zoom, ZOOM_MIN, ZOOM_MAX);
  const scale = viewScale(image, circle, zoom);
  const maxX = Math.max(0, (image.width * scale - circle) / 2);
  const maxY = Math.max(0, (image.height * scale - circle) / 2);
  return { zoom, x: clamp(view.x, -maxX, maxX), y: clamp(view.y, -maxY, maxY) };
}

/** A new zoom about the circle's centre: the point under the centre stays under it. */
export function zoomAbout(image: ImageSize, circle: number, view: CropView, zoom: number): CropView {
  const next = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
  const ratio = next / view.zoom;
  return clampView(image, circle, { zoom: next, x: view.x * ratio, y: view.y * ratio });
}

/** Moved by `dx`, `dy` stage px (a drag, or an arrow key). */
export function panBy(image: ImageSize, circle: number, view: CropView, dx: number, dy: number): CropView {
  return clampView(image, circle, { ...view, x: view.x + dx, y: view.y + dy });
}

/**
 * ★ The single-pointer path for a drag (DEC-093, SC 2.5.7): a tap at `(px, py)` — relative to the circle's centre, in
 * stage px — brings the point under it to the centre.
 */
export function centreOn(image: ImageSize, circle: number, view: CropView, px: number, py: number): CropView {
  return panBy(image, circle, view, -px, -py);
}

/**
 * The circle's square in IMAGE px — what `encode.ts` draws onto the 1024 px canvas. The image's top-left corner sits
 * at `centre + offset - size·scale/2` in stage px, so the circle's top-left, in image px, is the inverse.
 */
export function sourceSquare(image: ImageSize, circle: number, view: CropView): { sx: number; sy: number; side: number } {
  const scale = viewScale(image, circle, view.zoom);
  const side = circle / scale;
  const sx = image.width / 2 - view.x / scale - side / 2;
  const sy = image.height / 2 - view.y / scale - side / 2;
  return { sx, sy, side };
}
