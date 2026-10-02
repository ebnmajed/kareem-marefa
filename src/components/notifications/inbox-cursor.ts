import { z } from "zod";

// The inbox's page boundary — «عرض الأقدم», D8 (DEC-218 §2.4), REQ-NTF-006.
//
// The last item's `(created_at, id)`. Two rows written in one transaction share `created_at` — a fan-out writes a
// member's points and level notices together — so the id breaks the tie (`CLAUDE.md`: never «the last row» by a
// timestamp alone). Opaque in the URL; anything this module did not write decodes to null, which is «the first page».

const cursorShape = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() });
export type InboxCursor = z.infer<typeof cursorShape>;

export function encodeInboxCursor(cursor: InboxCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeInboxCursor(raw: string | null | undefined): InboxCursor | null {
  if (!raw) return null;
  try {
    const parsed = cursorShape.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
