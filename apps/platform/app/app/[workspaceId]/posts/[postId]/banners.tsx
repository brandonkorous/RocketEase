import Link from "next/link";
import type { ContentItem } from "@/db/schema/content";
import { formatInZone } from "@/lib/time";
import { workspacePath } from "@/lib/nav";

/** Approval state banner — persistent/blocking, so an Alert-style block, not a toast. */
export function ApprovalBanner({ workspaceId, item, dueAt, requestId, tz }: { workspaceId: string; item: ContentItem; dueAt: Date | null; requestId: string | null; tz: string }) {
  if (item.approvalState === "pending") {
    return (
      <div className="mt-6 rounded-box border border-info/40 bg-info/10 px-5 py-3 text-sm">
        <strong>Waiting for approval.</strong> {dueAt ? `Due ${formatInZone(dueAt, tz)}.` : ""} <Link href={workspacePath(workspaceId, `approvals?request=${requestId ?? ""}`)} className="font-medium underline underline-offset-2">Open in Approvals</Link>
      </div>
    );
  }
  if (item.approvalState === "changes_requested") {
    return <div className="mt-6 rounded-box border border-warning/40 bg-warning/10 px-5 py-3 text-sm"><strong>Changes requested.</strong> See the comments below, edit the post, then request approval again.</div>;
  }
  if (item.approvalState === "approved" && !["scheduled", "published", "partially_published", "publishing"].includes(item.status)) {
    return <div className="mt-6 rounded-box border border-success/40 bg-success/10 px-5 py-3 text-sm"><strong>Approved.</strong> Schedule it from the composer, or it was scheduled automatically if the request asked for that.</div>;
  }
  return null;
}
