import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PlayScope } from "@/components/ui/scope";

// The public site's chrome — SCR-000 and SCR-001, REQ-UIX-114, REQ-NFR-019, DEC-247.
//
// ★ Wave 26: the public site is inside the playground, like every other surface (DEC-199 §1.3 said it «moves
// last»; this is last). The scope is applied once, here, by the layout, and the header, the page and the footer
// are all inside it — which is what lets the mark's reveal play on the landing with no second, un-scoped copy of
// its keyframes.
//
// What REQ-NFR-019 freezes is not here: the URLs are the route group's, and the registration behaviour is
// `register/actions.ts` and the form's own markup. This file changes how the three look and nothing they do.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlayScope root className="min-h-dvh">
      <div className="flex min-h-dvh flex-col bg-canvas text-fg-body">
        <Header />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
      </div>
    </PlayScope>
  );
}
