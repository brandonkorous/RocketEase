"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contact, savedReply } from "@/db/schema/engagement";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";

const contactSchema = z.object({ email: z.string().email().or(z.literal("")).optional(), location: z.string().max(120).optional() });

export async function updateContact(workspaceId: string, contactId: string, input: z.infer<typeof contactSchema>): Promise<ActionState> {
  return guard(async () => {
    await requireCapability(workspaceId, "conversations.handle");
    const parsed = contactSchema.safeParse(input);
    if (!parsed.success) return fail("Enter a valid email address.");
    await db.update(contact).set({ email: parsed.data.email || null, location: parsed.data.location?.trim() || null, updatedAt: new Date() }).where(and(eq(contact.id, contactId), eq(contact.workspaceId, workspaceId)));
    return { ok: "Contact updated." };
  });
}

export async function setContactTags(workspaceId: string, contactId: string, tags: string[]): Promise<ActionState> {
  return guard(async () => {
    await requireCapability(workspaceId, "conversations.handle");
    const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20);
    await db.update(contact).set({ tags: clean, updatedAt: new Date() }).where(and(eq(contact.id, contactId), eq(contact.workspaceId, workspaceId)));
    return { ok: "Tags updated." };
  });
}

const replySchema = z.object({ id: z.string().optional(), title: z.string().min(1).max(80), body: z.string().min(1).max(2000), shortcut: z.string().max(30).optional() });

export async function saveSavedReply(workspaceId: string, input: z.infer<typeof replySchema>): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "conversations.handle");
    const parsed = replySchema.safeParse(input);
    if (!parsed.success) return fail("Saved replies need a title and text.");
    const { id, title, body, shortcut } = parsed.data;
    if (id) await db.update(savedReply).set({ title, body, shortcut: shortcut || null, updatedAt: new Date() }).where(and(eq(savedReply.id, id), eq(savedReply.workspaceId, workspaceId)));
    else await db.insert(savedReply).values({ organizationId: ctx.workspace.organizationId, workspaceId, title, body, shortcut: shortcut || null, createdByUserId: ctx.session.user.id });
    return { ok: "Saved reply stored." };
  });
}

export async function deleteSavedReply(workspaceId: string, id: string): Promise<ActionState> {
  return guard(async () => {
    await requireCapability(workspaceId, "conversations.handle");
    await db.delete(savedReply).where(and(eq(savedReply.id, id), eq(savedReply.workspaceId, workspaceId)));
    return { ok: "Saved reply removed." };
  });
}
