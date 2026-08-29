"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contentItem, postVariant } from "@/db/schema/content";
import { audit } from "@/lib/audit";
import { can } from "@/lib/authz";
import { publishableChannels, summarizeItem } from "@/lib/content";
import { checkRow, MAX_IMPORT_ROWS, parsePostsCsv, rowBlocked, type CheckedRow, type ImportChannel } from "@/lib/importing/csv";
import { requireCapability } from "@/lib/session";
import { utcToZonedInput } from "@/lib/time";
import { workspacePath } from "@/lib/nav";
import { scheduleItem } from "./scheduling";
import { fail, guard, type ActionState } from "./shared";

export type ImportProblem = { severity: "error" | "warning"; message: string; channelName?: string };
export type ImportRow = { line: number; title: string; channelNames: string[]; when: string | null; blocked: boolean; problems: ImportProblem[] };
export type ImportResult = ActionState & { rows?: ImportRow[]; ignored?: number; created?: number; scheduled?: number };

const schema = z.object({
  workspaceId: z.string().min(1),
  /** The file's text; the browser reads it, we never fetch anything. */
  csv: z.string().min(1, "Choose a CSV file.").max(2_000_000),
  commit: z.boolean().default(false),
  /** Only honoured for rows that carry a future time and validate clean. */
  schedule: z.boolean().default(false),
});
export type ImportPostsInput = z.input<typeof schema>;

const view = (r: CheckedRow): ImportRow => ({
  line: r.line,
  title: r.text.slice(0, 80) || "(no text)",
  channelNames: r.channelNames,
  when: r.scheduledAtIso,
  blocked: rowBlocked(r),
  problems: r.problems.map((p) => ({ severity: p.severity, message: p.message, channelName: p.channelName })),
});

async function createDraftRow(ws: { id: string; organizationId: string }, r: CheckedRow, userId: string) {
  const [row] = await db.transaction(async (tx) => {
    const [item] = await tx
      .insert(contentItem)
      .values({ organizationId: ws.organizationId, workspaceId: ws.id, title: r.text.slice(0, 80) || "Imported post", sharedText: r.text, link: r.link, importNote: r.mediaUrls.length ? `Media from CSV (not fetched): ${r.mediaUrls.join(" ")}` : null, ownerUserId: userId, createdByUserId: userId })
      .returning({ id: contentItem.id });
    for (const channelId of r.channelIds)
      await tx.insert(postVariant).values({ organizationId: ws.organizationId, workspaceId: ws.id, contentItemId: item.id, channelId, firstComment: r.firstComment }).onConflictDoNothing();
    return [item];
  });
  await summarizeItem(row.id);
  return row.id;
}

/**
 * CSV import (IMP-001). `commit: false` is a dry run — nothing is written, and
 * every row comes back with its own problems. Committing always creates DRAFTS;
 * a row is only scheduled when the caller asked for it, the row carries a
 * future time, and it validates clean.
 */
export async function importPostsCsv(input: ImportPostsInput): Promise<ImportResult> {
  const parsedInput = schema.safeParse(input);
  if (!parsedInput.success) return fail(parsedInput.error.issues[0]?.message ?? "Invalid import");
  const { workspaceId, csv, commit, schedule } = parsedInput.data;
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const parsed = parsePostsCsv(csv);
    if (parsed.headerError) return fail(parsed.headerError);
    if (parsed.rows.length === 0) return fail("No rows to import.");

    const rows = await publishableChannels(workspaceId);
    const channels: ImportChannel[] = rows.map((c) => ({ id: c.id, name: c.name, handle: c.handle, network: c.network, capabilities: c.capabilities }));
    if (channels.length === 0) return fail("Connect an account before importing posts.");
    const now = new Date();
    const checked = parsed.rows.map((r) => checkRow(r, channels, now));
    const preview = { rows: checked.map(view), ignored: parsed.ignored };

    if (!commit) {
      const bad = checked.filter(rowBlocked).length;
      return { ...preview, ok: bad === 0 ? `${checked.length} row${checked.length === 1 ? "" : "s"} ready to import.` : `${checked.length - bad} of ${checked.length} rows can be imported.` };
    }

    const importable = checked.filter((r) => !rowBlocked(r));
    if (importable.length === 0) return { ...preview, error: "Every row has a problem. Fix them and try again." };
    const mayPublish = schedule && can({ role: ctx.workspace.role, grants: ctx.workspace.grants }, "content.publish", { policyAllows: true });

    let created = 0;
    let scheduled = 0;
    for (const r of importable) {
      const itemId = await createDraftRow({ id: workspaceId, organizationId: ctx.workspace.organizationId }, r, ctx.session.user.id);
      created++;
      if (!mayPublish || !r.scheduledAtIso || new Date(r.scheduledAtIso) <= now) continue;
      const when = utcToZonedInput(new Date(r.scheduledAtIso), ctx.workspace.timezone);
      const res = await scheduleItem({ workspaceId, itemId, when });
      if (res.error) await db.update(contentItem).set({ updatedAt: new Date() }).where(eq(contentItem.id, itemId));
      else scheduled++;
    }
    await audit({ action: "content.import_csv", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "workspace", targetId: workspaceId, summary: { after: { rows: checked.length, created, scheduled, skipped: checked.length - importable.length, ignored: parsed.ignored, cap: MAX_IMPORT_ROWS } } });
    revalidatePath(workspacePath(workspaceId, "calendar"));
    return { ...preview, created, scheduled, ok: `Imported ${created} draft${created === 1 ? "" : "s"}${scheduled ? `, ${scheduled} scheduled` : ""}.` };
  });
}
