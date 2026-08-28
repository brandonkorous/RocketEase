import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { CheckIcon } from "@make-it-social/ui/icons";

export function DoneStep({ firstName, dashboardHref }: { firstName: string; dashboardHref: string }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-content"><CheckIcon size={22} /></span>
      <div className="flex-1">
        <h1 className="text-xl font-bold tracking-tight">You&apos;re all set, {firstName}!</h1>
        <p className="mt-1 text-sm text-secondary">Your workspace is ready. Time to plan, publish, and grow your social presence.</p>
      </div>
      <Link href={dashboardHref} className={buttonClasses({ color: "primary" })}>Go to dashboard</Link>
    </div>
  );
}
