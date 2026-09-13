import { Wordmark } from "@/components/wordmark";

// The three unauthenticated platform screens share a centred card on the
// brand's dark canvas (09 SCR-002 … SCR-004), under the wordmark alone —
// no marketing chrome (DEC-038).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="theme-dark min-h-dvh bg-navy-950 px-4 pb-16 pt-10 text-fg-body md:pt-16">
      <div className="mx-auto mb-10 flex w-full max-w-md justify-center">
        <Wordmark />
      </div>
      <div className="mx-auto w-full max-w-md rounded-field border border-edge bg-navy-900/60 p-6 shadow-xl md:p-8">{children}</div>
    </main>
  );
}
