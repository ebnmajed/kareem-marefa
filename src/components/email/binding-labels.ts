// The builder's variables, shown as words and stored as bindings — wave 23, REQ-UIX-112, REQ-NTF-012.
//
// ★ AN ADMIN READS «{اسم العضو}»; THE DATABASE STORES `{{member.name}}`. The artboard draws the variables as Arabic
// chips and the canvas shows them inside the text, so a field SHOWS the token and STORES the binding — one map per
// message, from the bindings that message offers (`public.notification_bindings()`). Nothing here decides what is
// legal: an unmapped `{word}` stays literal text, and the trigger still refuses a binding the key does not offer.

/** Payload ids and counters: offered so a link can be built, never something an admin writes into words. */
const HIDDEN = new Set(["session_id", "proposal_id", "rsvp_id", "comment_id", "certificate_id", "offset_minutes", "dayPosition", "dayCount", "member.email"]);

/** The message key for a binding's label — `member.name` → `member_name`, because a dot is a path to next-intl. */
export const labelKey = (binding: string) => binding.replace(/\./g, "_");

/** The bindings a chip may insert, in the order the message offers them. */
export function chipBindings(offered: readonly string[]): string[] {
  return offered.filter((binding) => !HIDDEN.has(binding));
}

/** binding → «{label}». */
export type TokenMap = ReadonlyMap<string, string>;

export function tokenMap(offered: readonly string[], label: (binding: string) => string): TokenMap {
  return new Map(chipBindings(offered).map((binding) => [binding, `{${label(binding)}}`]));
}

const STORED = /\{\{\s*([\w.]+)\s*\}\}/g;

/** `{{member.name}}` → `{اسم العضو}` for every binding the map knows; anything else as it is. */
export function toDisplay(text: string, tokens: TokenMap): string {
  return text.replace(STORED, (whole, binding: string) => tokens.get(binding) ?? whole);
}

/** The inverse: each known `{label}` back to its `{{binding}}`. */
export function toStored(text: string, tokens: TokenMap): string {
  let out = text;
  for (const [binding, token] of tokens) out = out.split(token).join(`{{${binding}}}`);
  return out;
}
