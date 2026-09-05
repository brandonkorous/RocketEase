/*
 * Connection health as a notification. A channel that slips into
 * `action_required` or `revoked` blocks its scheduled posts, and until M14.2
 * nobody was told. Fires on the TRANSITION only (health-rules.ts).
 */
import type { ChannelStatus } from "@/db/schema/connections";
import { workspacePath } from "@/lib/nav";
import { notify } from "@/lib/notifications";
import { healthBody, healthTitle, needsHealthNotice, type HealthChannel } from "./health-rules";

/** Tell the workspace's owners, admins and managers, once per transition. Returns whether it did. */
export async function notifyChannelHealth(ch: HealthChannel, previous: ChannelStatus, next: ChannelStatus, message?: string | null): Promise<boolean> {
  if (!needsHealthNotice(previous, next)) return false;
  await notify({
    workspaceId: ch.workspaceId,
    organizationId: ch.organizationId,
    userId: null,
    kind: "connection.health",
    title: healthTitle(ch, next),
    body: healthBody(next, message),
    href: workspacePath(ch.workspaceId, "accounts"),
    email: true,
  });
  return true;
}
