import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { workspacePath } from "@/lib/nav";

/** Build-time flag. With it unset the generator is never advertised anywhere. */
export const AI_GENERATOR_ENABLED = process.env.NEXT_PUBLIC_AI_ENABLED === "1";

const HREF = (workspaceId: string) => workspacePath(workspaceId, "create/generate");

/** Slim strip above the composer. One entry point, no persuasion. */
export function GenerateStrip({ workspaceId }: { workspaceId: string }) {
  if (!AI_GENERATOR_ENABLED) return null;
  return (
    <div className="mx-auto w-full max-w-360 px-6 pt-5 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-box border border-base-300 px-4 py-2.5">
        <p className="text-sm text-secondary">Not sure where to start? Generate concepts from a brief, then edit them here.</p>
        <Link href={HREF(workspaceId)} className={buttonClasses({ color: "neutral", variant: "outline", size: "sm" })}>Generate with AI</Link>
      </div>
    </div>
  );
}

/** Home header action, next to "Create post". */
export function GenerateLink({ workspaceId }: { workspaceId: string }) {
  if (!AI_GENERATOR_ENABLED) return null;
  return (
    <Link href={HREF(workspaceId)} className={buttonClasses({ color: "neutral", variant: "outline" })}>Generate with AI</Link>
  );
}
