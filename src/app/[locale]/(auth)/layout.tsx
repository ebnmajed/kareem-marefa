// The three unauthenticated platform screens share a centred card on the
// brand's dark canvas (09 SCR-002 … SCR-004). The marketing header is fixed
// above; the padding keeps the card clear of it.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-dark min-h-dvh bg-navy-950 px-4 pb-16 pt-28 text-fg-body md:pt-36">
      <div className="mx-auto w-full max-w-md rounded-field border border-edge bg-navy-900/60 p-6 shadow-xl md:p-8">{children}</div>
    </div>
  );
}
