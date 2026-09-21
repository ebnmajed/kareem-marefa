// The forced-dark SIMULATION — `16` §11.4, and `designer`'s warning
// (`0e7ddca`) that the obvious implementation cannot find what it is for.
//
// ★ IT SUBSTITUTES COLOURS AND LEAVES IMAGES ALONE.
//
// The natural implementation is `filter: invert(1)` on the frame. That inverts
// everything painted inside, **`<img>` included** — so a dark-ink logo comes
// out LIGHT, sits on a dark card, and survives beautifully. A false pass, from
// the obvious code, on the one finding that cannot be closed by argument. Worse
// than not building the toggle, because afterwards there is less reason to look.
//
// A client that forces dark substitutes colours over CSS and attribute values
// and leaves image PIXELS alone. That asymmetry is the whole question: an
// uninverted logo on an inverted ground.
//
// ★ AND IT MODELS THE PESSIMISTIC CLIENT, deliberately. `bgcolor` attributes
// are darkened here along with everything else — which is the case where the
// logo is at risk. An explicit attribute is *more likely* to be respected
// (that is what F2 buys) but not guaranteed, and a simulation that assumed the
// attribute always survives would answer the easy half of the question. If a
// logo reads here, it reads everywhere; if it does not, F2 is not enough on
// its own and the answer is a per-scheme asset.
//
// ★ IT IS NOT WHAT SHIPS, AND IT SAYS SO IN THREE PLACES: this comment, the
// marker in the emitted HTML, and the note under the mode switcher. A
// simulation pretending to be the shipped bytes would be the second renderer
// `REQ-NTF-010` forbids; a NAMED one is a model of what a client does to them,
// which is the only honest thing a preview can offer.

const DARK_GROUND = "#14161a";
const DARK_RAISED = "#1d2029";
const DARK_TEXT = "#e8e8e8";
const DARK_MUTED = "#b9bec7";
const DARK_LINK = "#8ab4f8";

/**
 * Appends the simulation to a rendered message.
 *
 * The bytes above the marker are exactly what `renderEmail()` produced; nothing
 * is rewritten, so what an admin reads is the message plus a stylesheet they
 * are told about.
 */
export function simulateForcedDark(html: string): string {
  const style = [
    `<style data-kareem-simulation="forced-dark">`,
    // The ground and every surface, including the `bgcolor` cells: the
    // pessimistic client.
    `body,table,td,div{background-color:${DARK_GROUND} !important;color:${DARK_TEXT} !important;}`,
    `table table,table table td{background-color:${DARK_RAISED} !important;}`,
    `span{color:${DARK_MUTED} !important;}`,
    `a{color:${DARK_LINK} !important;}`,
    `hr{border-top-color:#39404d !important;}`,
    // ★ NOT TOUCHED. An `img` rule here — any rule — is the false pass.
    // Stated rather than omitted, so nobody adds one as a tidy-up.
    `/* img: deliberately untouched — a client that forces dark does not repaint image pixels */`,
    `</style>`,
  ].join("");

  const marker = `<!-- kareem: forced-dark SIMULATION appended below. Everything above this line is the message as it would be sent. -->`;
  // Before `</body>` so it wins the cascade; if the shell ever stops emitting
  // one, appending is still correct HTML.
  return html.includes("</body>") ? html.replace("</body>", `${marker}${style}</body>`) : `${html}${marker}${style}`;
}
