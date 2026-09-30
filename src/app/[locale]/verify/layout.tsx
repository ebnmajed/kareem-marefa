import { PlayScope } from "@/components/ui/scope";

// The certificate's verification page — public, and not one of the five frozen routes.
//
// ★ Wave 17 (DEC-199 §1.3, REQ-UIX-049): every surface that is not the public
// site is inside the playground's scope, applied once, by its layout. This file
// exists for that alone: the page below renders its own `<main>` and no chrome.
// It is the token level — one palette, one type, one set of primitives — and not
// the page's redesign (DEC-199 §2). The certificate itself is a rendered artifact and keeps its look: the playground stops at its edge.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <PlayScope root className="min-h-dvh">
      {children}
    </PlayScope>
  );
}
