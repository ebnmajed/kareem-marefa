import { PlayScope } from "@/components/ui/scope";

// The unsubscribe page's scope — `REQ-NTF-019`. Every surface that is not the public site wears the playground,
// applied once, by its layout (DEC-199 §1.3), as `/verify` does.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <PlayScope root className="min-h-dvh">
      {children}
    </PlayScope>
  );
}
