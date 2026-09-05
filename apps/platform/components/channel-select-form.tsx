"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertContent, Avatar, Badge, Button, Checkbox } from "@wizeworks/silicaui-react";
import { NetMark } from "./net-mark";
import { discardConnection, selectChannels, type ActionState } from "@/lib/actions/connections";
import { workspacePath } from "@/lib/nav";

export type SelectableChannel = {
  key: string;
  network: string;
  kind: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  publishable: boolean;
  reason: string | null;
  formats: string[];
  inbox: boolean;
  already: boolean;
};

const KIND_LABEL: Record<string, string> = {
  instagram_business: "Instagram business account",
  facebook_page: "Facebook Page",
  linkedin_organization: "LinkedIn Page",
  linkedin_member: "LinkedIn profile",
  tiktok_account: "TikTok account",
  threads_profile: "Threads profile",
  bluesky_account: "Bluesky account",
  mock_profile: "Demo profile",
};

export function ChannelSelectForm({ workspaceId, connectionId, channels, error, next = null }: { workspaceId: string; connectionId: string; channels: SelectableChannel[]; error: string | null; next?: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(selectChannels, {});
  const router = useRouter();
  const [discarding, start] = useTransition();

  return (
    <form action={action} className="mt-8 max-w-180">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="connectionId" value={connectionId} />
      {next && <input type="hidden" name="next" value={next} />}
      {(error || state.error) && (
        <Alert color="error" role="alert" className="mb-4">
          <AlertContent>{error ?? state.error}</AlertContent>
        </Alert>
      )}
      {channels.length === 0 && !error && (
        <p className="text-base text-secondary">No accounts were returned. Make sure your login manages at least one page or business account, then reconnect.</p>
      )}
      <ul className="divide-y divide-base-300 rounded-box border border-base-300">
        {channels.map((c) => (
          <li key={c.key}>
            <label className={`flex items-start gap-4 p-4 ${c.already ? "opacity-60" : "cursor-pointer hover:bg-base-200"}`}>
              <Checkbox name="selected" value={c.key} defaultChecked={!c.already && c.publishable} disabled={c.already} className="mt-1" />
              <Avatar size="md" shape="rounded" color="neutral" alt="" src={c.avatarUrl ?? undefined}>
                {c.name.slice(0, 2).toUpperCase()}
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <NetMark network={c.network} />
                  <span className="font-semibold">{c.name}</span>
                  {c.handle && <span className="text-sm text-secondary/70">{c.handle}</span>}
                  {c.already && <Badge size="xs" variant="soft" color="neutral">Already connected</Badge>}
                </span>
                <span className="mt-1 block text-sm text-secondary">{KIND_LABEL[c.kind] ?? c.kind}</span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {c.publishable ? (
                    c.formats.map((f) => (
                      <Badge key={f} size="xs" variant="outline" color="neutral">
                        {f}
                      </Badge>
                    ))
                  ) : (
                    <Badge size="xs" variant="soft" color="warning">
                      Read-only{c.reason ? ` · ${c.reason}` : ""}
                    </Badge>
                  )}
                  {c.inbox && <Badge size="xs" variant="outline" color="neutral">inbox</Badge>}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" loading={pending} disabled={channels.every((c) => c.already)}>
          Add selected accounts
        </Button>
        <Button
          type="button"
          variant="ghost"
          color="neutral"
          disabled={discarding}
          onClick={() =>
            start(async () => {
              await discardConnection(workspaceId, connectionId);
              router.push(workspacePath(workspaceId, "accounts"));
            })
          }
        >
          Cancel and discard connection
        </Button>
      </div>
    </form>
  );
}
