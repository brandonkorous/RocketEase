import Link from "next/link";
import { Mark } from "@make-it-social/ui/icons";
import { BrandPanel } from "@/components/auth/brand-panel";

/** Split screen: brand panel left, form card right (auth mockup). Stacks on small screens. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <BrandPanel />
      <main className="flex flex-1 flex-col">
        <header className="flex h-16 items-center px-6 lg:hidden">
          <Link href="/" className="flex items-center gap-2.5 font-bold" aria-label="Make It Social"><Mark size={28} /><span>Make It Social</span></Link>
        </header>
        <div className="flex flex-1 items-center justify-center px-5 pb-16 pt-6 lg:pt-16">
          <div className="w-full max-w-100">{children}</div>
        </div>
      </main>
    </div>
  );
}
