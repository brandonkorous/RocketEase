import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { PlugIcon } from "../shell/icons";
import { NetMark } from "../net-mark";
import { StepIntro } from "./frame";

export type ConnectOption = { key: string; displayName: string; networks: string[] };
export type ConnectedChannel = { id: string; name: string; network: string };

/** Step 2: one row per provider; connecting runs the real OAuth flow and returns here. */
export function ConnectStep({ workspaceId, providers, channels, nextHref }: { workspaceId: string; providers: ConnectOption[]; channels: ConnectedChannel[]; nextHref: string }) {
  const back = encodeURIComponent(`/onboarding?step=connect&workspace=${workspaceId}`);
  return (
    <div>
      <StepIntro icon={<PlugIcon />} title="Connect your social channels" copy="Choose the platforms you want to manage and grow." />
      <ul className="flex flex-col gap-2">
        {providers.map((p) => {
          const mine = channels.filter((c) => p.networks.includes(c.network));
          return (
            <li key={p.key} className="flex items-center gap-3 rounded-field border border-base-300 px-3 py-2.5">
              <span className="flex -space-x-1">{p.networks.map((n) => (<NetMark key={n} network={n} size={18} />))}</span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{p.displayName}</span>{mine.length > 0 && <span className="block truncate text-xs text-secondary">{mine.map((c) => c.name).join(", ")}</span>}</span>
              <a href={`/api/connect/${p.key}/start?workspaceId=${workspaceId}&next=${back}`} className={buttonClasses({ size: "sm", variant: mine.length ? "outline" : "solid", color: mine.length ? "neutral" : "primary" })}>{mine.length ? "Add more" : "Connect"}</a>
            </li>
          );
        })}
        {providers.length === 0 && <li className="rounded-field border border-dashed border-base-300 p-4 text-center text-sm text-secondary">No networks are configured on this server yet.</li>}
      </ul>
      <div className="mt-6 flex flex-col items-center gap-2">
        <Link href={nextHref} className={`${buttonClasses({ color: "primary", size: "lg" })} w-full`}>{channels.length ? `Continue with ${channels.length} account${channels.length > 1 ? "s" : ""}` : "Continue"}</Link>
        {channels.length === 0 && <Link href={nextHref} className="text-sm text-secondary hover:underline">Skip for now</Link>}
      </div>
    </div>
  );
}
