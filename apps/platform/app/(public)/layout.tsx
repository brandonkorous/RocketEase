import Link from "next/link";
import { Mark } from "@rocketease/ui/icons";
import { Wordmark } from "@rocketease/ui/brand";

/** Signed-out shell for pages anyone may read (see middleware's PUBLIC list). */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-base-300">
        <div className="mx-auto flex h-16 w-full max-w-360 items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5 font-bold" aria-label="RocketEase"><Mark size={28} /><Wordmark /></Link>
          <Link href="/login" className="text-sm font-medium text-secondary hover:text-base-content">Sign in</Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-360 flex-1 px-6 py-12">{children}</main>
    </div>
  );
}
