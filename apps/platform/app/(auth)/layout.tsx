import Link from "next/link";
import { Mark } from "@make-it-social/ui/icons";

/* Auth screens keep the black/white brand without marketing layout (pages.md). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="page-container flex h-16 items-center">
        <Link href="/" className="flex items-center gap-2.5 font-bold" aria-label="Make It Social">
          <Mark size={28} />
          <span>Make It Social</span>
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pt-10 pb-16 md:pt-16">
        <div className="w-full max-w-105">{children}</div>
      </main>
    </div>
  );
}
