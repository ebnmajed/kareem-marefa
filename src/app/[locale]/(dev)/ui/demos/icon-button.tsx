import type { ButtonVariant, Size } from "@/components/ui";
import { IconButton } from "@/components/ui/icon-button";
import { BookmarkIcon, ChevronIcon, CloseIcon, MoreIcon, PlusIcon, ShareIcon, TrashIcon } from "@/components/ui/icons";

// The gallery's `icon-button` demo — wave 17, contract 3 (DEC-199 §3). A button
// in a square: the six faces, the three sizes, pending (the spinner, the name
// kept), disabled, and `aria-disabled` — the inert-but-focusable form the
// reorderable list and the lightbox use at an end. Every one is named.

const VARIANTS: { variant: ButtonVariant; label: string; glyph: React.ReactNode }[] = [
  { variant: "primary", label: "أضف", glyph: <PlusIcon /> },
  { variant: "secondary", label: "شارك", glyph: <ShareIcon /> },
  { variant: "ghost", label: "أغلق", glyph: <CloseIcon /> },
  { variant: "danger", label: "احذف", glyph: <TrashIcon /> },
  { variant: "signal", label: "التالي", glyph: <ChevronIcon direction="forward" /> },
  { variant: "quiet", label: "المزيد", glyph: <MoreIcon /> },
];

const SIZES: Size[] = ["lg", "md", "sm"];

export function IconButtonDemo() {
  return (
    <div data-demo="icon-button" className="flex flex-col gap-5">
      <div data-state="variants" className="flex flex-wrap items-center gap-3">
        {VARIANTS.map(({ variant, label, glyph }) => (
          <IconButton key={variant} variant={variant} label={label}>
            {glyph}
          </IconButton>
        ))}
      </div>

      <div data-state="sizes" className="flex flex-wrap items-center gap-3">
        {SIZES.map((size) => (
          <IconButton key={size} size={size} label="احفظ الجلسة">
            <BookmarkIcon />
          </IconButton>
        ))}
        {SIZES.map((size) => (
          <IconButton key={size} size={size} variant="quiet" label="المزيد">
            <MoreIcon />
          </IconButton>
        ))}
      </div>

      <div data-state="states" className="flex flex-wrap items-center gap-3">
        <IconButton label="جارٍ الحفظ" pending>
          <BookmarkIcon />
        </IconButton>
        <IconButton variant="quiet" label="جارٍ الحذف" pending>
          <TrashIcon />
        </IconButton>
        <IconButton label="شارك" disabled>
          <ShareIcon />
        </IconButton>
        <IconButton variant="quiet" label="المزيد" disabled>
          <MoreIcon />
        </IconButton>
        <IconButton label="انقل لأعلى" aria-disabled className="aria-disabled:cursor-not-allowed aria-disabled:opacity-45">
          <ChevronIcon direction="up" />
        </IconButton>
      </div>
    </div>
  );
}
