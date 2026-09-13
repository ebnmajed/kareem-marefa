import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

// The marketing chrome, exactly as the locale layout rendered it before
// DEC-038 moved it here: the fixed header, the main landmark, the footer.
// Route groups add no DOM, so the frozen routes' HTML is unchanged
// (REQ-NFR-019; `npm run visual` proves it). The platform routes have
// their own layouts and never see this.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
