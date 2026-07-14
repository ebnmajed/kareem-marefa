/**
 * The "connection thread" — the page's signature seam element. A single
 * hairline crossing a dark→light boundary with one dot at the cut: one node
 * of the network leaving the hero and entering practice. Purely decorative.
 * Place as the first child of the light section (which must be `relative`).
 */
export function SeamThread() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
      <div className="seam-thread-grow flex -translate-y-12 flex-col items-center">
        <span className="h-12 w-px bg-silver-300/30" />
        <span className="my-[-1px] size-[5px] rounded-full bg-silver-300" />
        <span className="h-12 w-px bg-silver-300" />
      </div>
    </div>
  );
}
