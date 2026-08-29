import Link from "next/link";
import { Mark } from "@rocketease/ui/icons";
import { Wordmark } from "@rocketease/ui/brand";

/** Brand link used in both halves of the split screen. */
export function BrandLink({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 font-bold ${className}`} aria-label="RocketEase">
      <Mark size={size} />
      <Wordmark />
    </Link>
  );
}

/** Left half of the split screen (auth mockup): black panel over a monochrome photo.
 *  `dim` drops the photo back for panels carrying long-form text. */
export function SidePanel({ label, dim, children }: { label: string; dim?: boolean; children: React.ReactNode }) {
  return (
    <aside data-theme="rke-dark" className="relative hidden overflow-hidden bg-base-100 text-base-content lg:flex lg:w-1/2 lg:flex-col" aria-label={label}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/auth-hero.jpg" alt="" className={`absolute inset-0 h-full w-full object-cover object-right grayscale ${dim ? "opacity-20" : "opacity-60"}`} />
      <div className="relative flex h-full flex-col overflow-y-auto p-10">
        <BrandLink size={30} className="shrink-0 text-lg" />
        {children}
      </div>
    </aside>
  );
}

type ShellProps = {
  /** The dark left panel — <BrandPanel /> for auth, <StepPanel /> for onboarding. */
  panel: React.ReactNode;
  /** Trailing header content (steps, exit link). Its presence keeps the header visible on desktop. */
  header?: React.ReactNode;
  align?: "center" | "start";
  /** Tailwind max-width for the content column. */
  width?: string;
  children: React.ReactNode;
};

/** Split screen: panel left, content right. Stacks below lg, where the panel is hidden. */
export function SplitShell({ panel, header, align = "center", width = "max-w-100", children }: ShellProps) {
  return (
    <div className="flex min-h-dvh">
      {panel}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className={`flex h-16 shrink-0 items-center justify-between gap-4 px-6 ${header ? "" : "lg:hidden"}`}>
          <BrandLink className="lg:invisible" />
          {header}
        </header>
        <div className={`flex flex-1 justify-center px-5 pb-16 pt-2 lg:pt-6 ${align === "start" ? "items-start" : "items-center"}`}>
          <div className={`w-full ${width}`}>{children}</div>
        </div>
      </main>
    </div>
  );
}
