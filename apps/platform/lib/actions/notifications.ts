"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notification } from "@/db/schema/app";
import { requireUser } from "@/lib/session";

export async function markNotificationRead(id: string) {
  const session = await requireUser();
  await db.update(notification).set({ readAt: new Date() }).where(and(eq(notification.id, id), eq(notification.userId, session.user.id), isNull(notification.readAt)));
}

export async function markAllRead(workspaceId: string) {
  const session = await requireUser();
  await db.update(notification).set({ readAt: new Date() }).where(and(eq(notification.workspaceId, workspaceId), eq(notification.userId, session.user.id), isNull(notification.readAt)));
  revalidatePath(`/app/${workspaceId}/notifications`);
}
