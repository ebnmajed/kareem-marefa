import { PlayScope } from "@/components/ui/scope";

// The door's layout — sign-in, choose-org, no-access — REBUILT for wave 18 from
// `docs/design/screens/m10a/{Main,ChooseOrg,NoAccess}.dc.html` (REQ-UIX-058,
// DEC-205, DEC-195 §5: the three `(auth)` screens open the member screens).
//
// It gives the scope and one column, and nothing else: the artboards differ in
// how large the wordmark stands and in what the foot carries, so those are each
// screen's, through `door.tsx`. The column is the phone's width at every size —
// no desktop artboard exists for the door (DEC-206 §4.36), and a sign-in card
// stretched across 1280 px would be a drawing nobody made.
//
// `PlayScope root` is rendered here and by no screen (DEC-199 §1.3, `scope-root`).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlayScope root className="min-h-dvh">
      <main id="main" className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-canvas px-5 pb-5 pt-6 text-fg-body">
        {children}
      </main>
    </PlayScope>
  );
}
